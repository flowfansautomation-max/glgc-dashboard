/* Shared live-data loader for the GLGC dashboards (standalone / GitHub Pages).
   Reads the published Google Sheet via gviz JSONP, snaps each response to the
   Saturday of its week, and exposes a normalized model. */
window.GLGC = (function () {
  var SHEET_ID = '1ZVpZ9LtsKZX0h3_bbXb3OLuTKrVxG5W3KJS8UEMdUgg';

  function load(cb, onErr) {
    if (typeof google !== 'undefined' && google.script && google.script.run) {
      google.script.run
        .withSuccessHandler(function (d) { cb(build((d && d.leaders) || [])); })
        .withFailureHandler(onErr || function () {})
        .getDashboardData();
    } else {
      window.__glgcCb = function (resp) {
        try { cb(build(processGviz(resp))); }
        catch (e) { if (onErr) onErr(e); }
      };
      var s = document.createElement('script');
      s.src = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID +
              '/gviz/tq?tqx=out:json;responseHandler:__glgcCb';
      s.onerror = function () { if (onErr) onErr(new Error('Could not reach the sheet')); };
      document.body.appendChild(s);
    }
  }

  function processGviz(resp) {
    var cols = resp.table.cols.map(function (c) { return String(c.label || '').trim(); });
    var iDate = cols.indexOf('Date'), iTs = cols.indexOf('Timestamp');
    var iLeader = cols.indexOf('Name of Leader who had the Service');
    var iHub = cols.indexOf('Hub Location'), iAtt = cols.indexOf('Attendance'), iOff = cols.indexOf('Offering');

    var byLeader = {};
    resp.table.rows.forEach(function (r) {
      var c = r.c || [];
      function val(i) { return (i >= 0 && c[i]) ? c[i].v : null; }
      var leader = String(val(iLeader) || '').trim();
      if (!leader) return;
      var d = parseDate(val(iDate)) || parseDate(val(iTs));
      if (!d) return;
      var sat = saturdayOfWeek(d), key = sat.getTime();
      if (!byLeader[leader]) byLeader[leader] = { leader: leader, location: '', weeks: {} };
      var hub = String(val(iHub) || '').trim();
      if (hub) byLeader[leader].location = hub;
      if (!byLeader[leader].weeks[key]) byLeader[leader].weeks[key] = { date: sat, attendance: 0, offering: 0 };
      byLeader[leader].weeks[key].attendance += toNum(val(iAtt));
      byLeader[leader].weeks[key].offering += toNum(val(iOff));
    });

    return Object.keys(byLeader).sort().map(function (name) {
      var L = byLeader[name];
      var pts = Object.keys(L.weeks).sort(function (a, b) { return a - b; }).map(function (k) {
        var w = L.weeks[k];
        return { week: isoWeek(w.date), dateLabel: fmtDate(w.date), attendance: w.attendance, offering: w.offering };
      });
      return { leader: L.leader, location: L.location, points: pts };
    });
  }

  // Adds aggregate views to the raw per-leader list.
  function build(leaders) {
    var leaderTotals = leaders.map(function (L) {
      var a = 0, o = 0;
      L.points.forEach(function (p) { a += p.attendance; o += p.offering; });
      return { leader: L.leader, location: L.location, attendance: a, offering: o, points: L.points };
    });

    var wk = {};
    leaders.forEach(function (L) {
      L.points.forEach(function (p) {
        var k = p.week + '|' + p.dateLabel;
        if (!wk[k]) wk[k] = { week: p.week, dateLabel: p.dateLabel, attendance: 0, offering: 0, hubs: 0 };
        wk[k].attendance += p.attendance;
        wk[k].offering += p.offering;
        wk[k].hubs += 1;
      });
    });
    var weeks = Object.keys(wk).map(function (k) { return wk[k]; })
      .sort(function (a, b) { return a.week - b.week; });

    return { leaders: leaders, leaderTotals: leaderTotals, weeks: weeks };
  }

  function parseDate(v) {
    if (v == null) return null;
    if (v instanceof Date) return v;
    var m = /^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/.exec(String(v));
    if (m) return new Date(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    var d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  function toNum(v) { var n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
  function saturdayOfWeek(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dow = x.getDay(), isoDow = (dow === 0) ? 7 : dow;
    x.setDate(x.getDate() + (6 - isoDow));
    return x;
  }
  function isoWeek(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    var ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - ys) / 86400000 + 1) / 7);
  }
  function fmtDate(d) {
    var dd = ('0' + d.getDate()).slice(-2), mm = ('0' + (d.getMonth() + 1)).slice(-2),
        yy = String(d.getFullYear()).slice(-2);
    return dd + '/' + mm + '/' + yy;
  }

  // Chart.js plugin: draw each value on top of its bar (always visible).
  var valueLabels = {
    id: 'valueLabels',
    afterDatasetsDraw: function (chart) {
      var ctx = chart.ctx;
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      chart.data.datasets.forEach(function (ds, di) {
        var meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        meta.data.forEach(function (bar, i) {
          var v = ds.data[i];
          if (v == null) return;
          ctx.fillText(v, bar.x, bar.y - 4);
        });
      });
      ctx.restore();
    }
  };

  return { load: load, valueLabels: valueLabels };
})();
