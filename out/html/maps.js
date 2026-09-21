/*
 * A tile-grid map of the states, drawn into an empty container that a scene places in its text:
 *
 *   <div class="state-map" data-source="result"></div>
 *
 * data-source is "result" for the election that has just been held, or "poll" for the current
 * projection. The container is filled in as it appears on the page.
 */
(function () {
    'use strict';

    // [column, row] of each state on an 11 x 8 tile grid, roughly following the map of the country.
    var LAYOUT = {
        ME: [10, 0],
        WI: [5, 1], VT: [8, 1], NH: [9, 1],
        WA: [0, 2], ID: [1, 2], MT: [2, 2], ND: [3, 2], MN: [4, 2], IL: [5, 2], MI: [6, 2], NY: [8, 2], MA: [9, 2],
        OR: [0, 3], NV: [1, 3], WY: [2, 3], SD: [3, 3], IA: [4, 3], IN: [5, 3], OH: [6, 3], PA: [7, 3], NJ: [8, 3], CT: [9, 3], RI: [10, 3],
        CA: [0, 4], UT: [1, 4], CO: [2, 4], NE: [3, 4], MO: [4, 4], KY: [5, 4], WV: [6, 4], VA: [7, 4], MD: [8, 4], DE: [9, 4],
        AZ: [1, 5], NM: [2, 5], KS: [3, 5], AR: [4, 5], TN: [5, 5], NC: [6, 5], SC: [7, 5],
        OK: [3, 6], LA: [4, 6], MS: [5, 6], AL: [6, 6], GA: [7, 6],
        TX: [3, 7], FL: [7, 7]
    };
    var PARTIES = ['rep', 'dem', 'fl'];
    var COLOR = {rep: [31, 78, 156], dem: [181, 101, 29], fl: [192, 57, 43]};
    var LABEL = {rep: 'R', dem: 'D', fl: 'FL'};
    var NAME = {rep: 'Republican', dem: 'Democratic', fl: 'Farmer-Labor'};

    function qualities() {
        var ui = window.dendryUI;
        return ui && ui.dendryEngine && ui.dendryEngine.state ? ui.dendryEngine.state.qualities : null;
    }

    function dark() {
        return document.body.classList.contains('dark-mode');
    }

    function partySpan(p) {
        var c = COLOR[p];
        return '<span style="color: rgb(' + c.join(',') + '); font-weight: bold;">' + LABEL[p] + '</span>';
    }

    // the races and state shares behind a container, from its data-source.
    function source(el, Q) {
        var poll = el.getAttribute('data-source') != 'result';
        var races = [];
        try {
            races = JSON.parse(Q[poll ? 'poll_sen_races' : 'sen_races'] || '[]');
        } catch (e) {
            races = [];
        }
        return {shareKey: poll ? 'poll_share_' : 'share_', races: races};
    }

    function drawMap(el, Q) {
        var src = source(el, Q);
        var up = {};
        src.races.forEach(function (r) { up[r.id] = r; });
        var width = el.getBoundingClientRect().width || 200;
        var font = Math.max(7, Math.floor(width / 11 * 0.42));
        var grid = document.createElement('div');
        grid.style.cssText = 'display: grid; grid-template-columns: repeat(11, 1fr); gap: 2px; margin: 0.4em 0;';
        Q.state_ids.forEach(function (id) {
            var pos = LAYOUT[id];
            if (!pos) {
                return;
            }
            var shares = PARTIES.map(function (p) { return Q[src.shareKey + id + '_' + p]; });
            var order = [0, 1, 2].sort(function (a, b) { return shares[b] - shares[a]; });
            var leader = PARTIES[order[0]];
            var lead = shares[order[0]] - shares[order[1]];
            // a closer race is a lighter tile.
            var alpha = lead < 5 ? 0.4 : lead < 15 ? 0.6 : lead < 30 ? 0.8 : 1;
            var c = COLOR[leader];
            var tile = document.createElement('div');
            tile.textContent = id;
            var text = alpha < 0.7 ? (dark() ? '#f0f0f0' : '#111') : '#fff';
            var border = up[id] ? '2px solid ' + (dark() ? '#f0f0f0' : '#111') : '2px solid transparent';
            tile.style.cssText = 'grid-column: ' + (pos[0] + 1) + '; grid-row: ' + (pos[1] + 1) + ';' +
                'aspect-ratio: 1; display: flex; align-items: center; justify-content: center; box-sizing: border-box;' +
                'font-size: ' + font + 'px; line-height: 1; border-radius: 2px; color: ' + text + ';' +
                'background: rgba(' + c.join(',') + ',' + alpha + '); border: ' + border + ';';
            var tip = Q['st_' + id + '_name'] + ': ' + PARTIES.map(function (p, i) {
                return LABEL[p] + ' ' + shares[i];
            }).join(', ') + ' (' + NAME[leader] + ' lead of ' + (Math.round(lead * 10) / 10) + ')';
            if (up[id]) {
                tip += '. Senate seat up: ' + LABEL[up[id].holder] + (up[id].holder == up[id].winner ?
                    ' holds' : ' loses to ' + LABEL[up[id].winner]);
            }
            tile.title = tip;
            grid.appendChild(tile);
        });
        var legend = document.createElement('div');
        legend.style.cssText = 'font-size: 0.8em; line-height: 1.3;';
        legend.innerHTML = PARTIES.map(function (p) { return partySpan(p); }).join(' / ') +
            ' lead the state vote. Lighter means a closer race; an outline means a Senate seat is up.';
        el.innerHTML = '';
        el.appendChild(grid);
        el.appendChild(legend);
    }

    function fill() {
        var Q = qualities();
        if (!Q || !Q.state_ids) {
            return;
        }
        Array.prototype.forEach.call(document.querySelectorAll('.state-map:not([data-drawn])'), function (el) {
            el.setAttribute('data-drawn', '1');
            drawMap(el, Q);
        });
    }

    var pending = false;
    new MutationObserver(function () {
        if (!pending) {
            pending = true;
            setTimeout(function () {
                pending = false;
                fill();
            }, 0);
        }
    }).observe(document.documentElement, {childList: true, subtree: true});

    window.fillMapsAndRaces = fill;
}());
