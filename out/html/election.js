/*
 * Election model, shared by the real elections (scene root.election_calc) and the
 * polls tab (scene status.polls). It reads the game's qualities (Q) and returns
 * results without changing Q; storeElection() writes them back under a prefix
 * ('' for real results, 'poll_' for projections).
 *
 *   1. Vote shares. Each region's demographic makeup and each group's party support give a
 *      base vote. Each state's own party multipliers (mod_<state>_<party>) nudge that into a
 *      state vote share. The multipliers are rescaled so each region's seat-weighted average
 *      is 1, except in the South, where they are used as written.
 *   2. House seats are decided by region, from the region's overall vote share (the
 *      seat-weighted average of its states). They are shared out by a cube law, so the leading
 *      party wins more seats than its vote share, with a per-region, per-party concentration
 *      factor (conc_<region>_<party>) standing in for how tightly a party's vote is packed.
 *   3. State vote shares are kept for statewide contests. Senate seats (computeSenate) go to the
 *      party with the most votes in the state, in the states whose class is up that year.
 */
(function () {
    'use strict';

    var PARTIES = ['rep', 'dem', 'fl'];
    var K = 3;

    // factional dissent, weighted by faction strength.
    window.factionDissent = function (Q) {
        var dsum = 0, ssum = 0;
        Q.factions.forEach(function (f) {
            dsum += Q[f + '_strength'] * Q[f + '_dissent'];
            ssum += Q[f + '_strength'];
        });
        return Math.round(dsum / ssum);
    };

    // live: add small random swings (a real election). Otherwise the result is deterministic.
    window.computeElection = function (Q, live) {
        var dissent = window.factionDissent(Q);
        var result = {
            dissent: dissent,
            vote: {},
            seats: {rep: 0, dem: 0, fl: 0},
            regions: {},
            states: {}
        };
        var natVotes = {rep: 0, dem: 0, fl: 0};
        var natWeight = 0;

        Q.regions.forEach(function (r) {
            var stateIds = Q.state_ids.filter(function (id) { return Q['st_' + id + '_region'] == r; });
            var regionShare = {rep: 0, dem: 0, fl: 0};
            var regionSeatsTotal = 0;

            // the region's baseline vote from its demographic makeup.
            var base = {};
            PARTIES.forEach(function (p) {
                var v = 0;
                Q.groups.forEach(function (g) {
                    v += Q['mix_' + r + '_' + g] * Q[g + '_' + p];
                });
                v *= Q['mod_' + r + '_' + p];
                if (p == 'fl') {
                    v *= (1 - dissent / 200);
                }
                if (live) {
                    v *= 1 + (Math.random() - 0.5) * 0.04;
                }
                base[p] = v;
            });

            // state multipliers are rescaled so that their seat-weighted average in the region is 1.
            var norm = {};
            PARTIES.forEach(function (p) {
                var msum = 0, wsum = 0;
                stateIds.forEach(function (id) {
                    msum += Q['st_' + id + '_seats'] * Q['mod_' + id + '_' + p];
                    wsum += Q['st_' + id + '_seats'];
                });
                // the South isn't calibrated to demographics, so its multipliers are used as they are.
                norm[p] = (r == 'south') ? 1 : msum / wsum;
            });

            // each state's vote share.
            stateIds.forEach(function (id) {
                var N = Q['st_' + id + '_seats'];
                var raw = {};
                var total = 0;
                PARTIES.forEach(function (p) {
                    var v = base[p] * Q['mod_' + id + '_' + p] / norm[p];
                    if (live) {
                        v *= 1 + (Math.random() - 0.5) * 0.02;
                    }
                    raw[p] = v;
                    total += v;
                });
                var share = {};
                PARTIES.forEach(function (p) {
                    share[p] = Math.round(1000 * raw[p] / total) / 10;
                    regionShare[p] += 100 * raw[p] / total * N;
                });
                regionSeatsTotal += N;
                result.states[id] = {share: share};
            });

            // the region's overall vote share is the seat-weighted average of its states.
            var average = {};
            PARTIES.forEach(function (p) {
                average[p] = regionShare[p] / regionSeatsTotal;
            });

            // House seats, by region: cube law, then largest remainder to make them add up.
            var w = {};
            var wtotal = 0;
            PARTIES.forEach(function (p) {
                w[p] = Math.pow(average[p] / 100, K) * Q['conc_' + r + '_' + p];
                wtotal += w[p];
            });
            var regionSeats = {rep: 0, dem: 0, fl: 0};
            var used = 0;
            var rem = [];
            PARTIES.forEach(function (p) {
                var x = regionSeatsTotal * w[p] / wtotal;
                regionSeats[p] = Math.floor(x);
                used += regionSeats[p];
                rem.push([x - regionSeats[p], p]);
            });
            rem.sort(function (a, b) { return b[0] - a[0]; });
            for (var i = 0; used < regionSeatsTotal; i++, used++) {
                regionSeats[rem[i][1]] += 1;
            }

            var regionResult = {share: {}, seats: regionSeats};
            PARTIES.forEach(function (p) {
                regionResult.share[p] = Math.round(10 * average[p]) / 10;
                // regions count in the national vote by their share of the electorate.
                natVotes[p] += average[p] * Q['voters_' + r];
                result.seats[p] += regionSeats[p];
            });
            natWeight += Q['voters_' + r];
            result.regions[r] = regionResult;
        });

        PARTIES.forEach(function (p) {
            result.vote[p] = Math.round(10 * natVotes[p] / natWeight) / 10;
        });

        // the House by congressional bloc. Republicans elected in the West are Liberal Republicans.
        var liberalRep = result.regions.west.seats.rep;
        result.blocs = {
            conservative_rep: result.seats.rep - liberalRep,
            liberal_rep: liberalRep,
            southern_dem: result.regions.south.seats.dem,
            northern_dem: result.seats.dem - result.regions.south.seats.dem,
            fl: result.seats.fl
        };
        return result;
    };

    // write a result into the game's qualities, e.g. share_MN_fl (prefix '') or poll_share_MN_fl ('poll_').
    window.storeElection = function (Q, result, prefix) {
        PARTIES.forEach(function (p) {
            Q[prefix + 'vote_' + p] = result.vote[p];
            Q[prefix + 'seats_' + p] = result.seats[p];
        });
        Q.regions.forEach(function (r) {
            PARTIES.forEach(function (p) {
                Q[prefix + 'share_' + r + '_' + p] = result.regions[r].share[p];
                Q[prefix + 'seats_' + r + '_' + p] = result.regions[r].seats[p];
            });
        });
        Q.state_ids.forEach(function (id) {
            PARTIES.forEach(function (p) {
                Q[prefix + 'share_' + id + '_' + p] = result.states[id].share[p];
            });
        });
        Object.keys(result.blocs).forEach(function (b) {
            Q[prefix + 'bloc_' + b] = result.blocs[b];
        });
    };

    // the year of the next House and Senate election (November of an even year).
    window.nextElectionYear = function (Q) {
        if (Q.year % 2 == 1) {
            return Q.year + 1;
        }
        return Q.month >= 11 ? Q.year + 2 : Q.year;
    };

    // which Senate class is up in a given year: 1928 Class 1, 1930 Class 2, 1932 Class 3, then repeat.
    window.senateClassUp = function (year) {
        return Math.round((year - 1928) / 2) % 3 + 1;
    };

    // a senator's bloc, from their party and state. Republicans from the West are Liberal Republicans and
    // Democrats from the South are Southern Democrats, matching how the House is split.
    window.senateBloc = function (Q, id, party) {
        var region = Q['st_' + id + '_region'];
        if (party == 'fl') {
            return 'fl';
        }
        if (party == 'rep') {
            return region == 'west' ? 'liberal_rep' : 'conservative_rep';
        }
        return region == 'south' ? 'southern_dem' : 'northern_dem';
    };

    // The Senate after an election in `year` (or as it stands, if year is null), given a House result
    // for the state vote shares. In each state whose class is up, the party with the most votes wins;
    // the holding party gets Q.senate_incumbency extra points. Returns the seats, bloc totals and
    // what changed, without changing Q.
    window.computeSenate = function (Q, result, year) {
        var classUp = year ? window.senateClassUp(year) : 0;
        var label = {rep: 'R', dem: 'D', fl: 'FL'};
        var out = {
            seats: {},
            blocs: {conservative_rep: 0, liberal_rep: 0, southern_dem: 0, northern_dem: 0, fl: 0},
            up: 0,
            won: {rep: 0, dem: 0, fl: 0},
            changes: []
        };
        Q.state_ids.forEach(function (id) {
            [1, 2].forEach(function (n) {
                var key = id + '_' + n;
                var party = Q['sen_' + key];
                if (Q['sen_' + key + '_class'] == classUp) {
                    out.up += 1;
                    var shares = result.states[id].share;
                    var winner = party;
                    var best = shares[party] + Q.senate_incumbency;
                    PARTIES.forEach(function (p) {
                        if (p != party && shares[p] > best) {
                            winner = p;
                            best = shares[p];
                        }
                    });
                    out.won[winner] += 1;
                    if (winner != party) {
                        out.changes.push(Q['st_' + id + '_name'] + ' (' + label[party] + ' to ' + label[winner] + ')');
                    }
                    party = winner;
                }
                out.seats[key] = party;
                out.blocs[window.senateBloc(Q, id, party)] += 1;
            });
        });
        return out;
    };

    // write a Senate result into the game's qualities. Only a real result (prefix '') changes who
    // holds each seat; a projection ('poll_') only stores its totals.
    window.storeSenate = function (Q, senate, prefix) {
        if (prefix == '') {
            Object.keys(senate.seats).forEach(function (key) {
                Q['sen_' + key] = senate.seats[key];
            });
        }
        Object.keys(senate.blocs).forEach(function (b) {
            Q[prefix + 'sen_bloc_' + b] = senate.blocs[b];
        });
        Q[prefix + 'sen_up'] = senate.up;
        PARTIES.forEach(function (p) {
            Q[prefix + 'sen_won_' + p] = senate.won[p];
        });
        Q[prefix + 'sen_changes'] = senate.changes.length ? senate.changes.join(', ') : 'none';
    };
}());
