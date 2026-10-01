/**
 * Движок расчёта — формулы и условное форматирование как в книге Excel.
 * Сравнение строк — без учёта регистра (как IF в Excel).
 */
(function (root) {
  "use strict";

  var DIV0 = { error: "#ДЕЛ/0!" };
  var VALUE = { error: "#ЗНАЧ!" };
  var NA = { error: "#Н/Д" };

  var CF = {
    ok: "#D9EAD3",
    mid: "#FFF2CC",
    bad: "#F4CCCC",
    header: "#C9DAF8",
  };

  function isError(v) {
    return v !== null && typeof v === "object" && typeof v.error === "string";
  }

  function isBlank(v) {
    return v === null || v === undefined || v === "";
  }

  function toNumber(v) {
    if (isError(v)) return v;
    if (isBlank(v)) return 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : VALUE;
    if (typeof v === "boolean") return v ? 1 : 0;
    var s = String(v).trim().replace(/\s/g, "").replace(",", ".");
    if (s === "") return 0;
    var n = Number(s);
    return Number.isFinite(n) ? n : VALUE;
  }

  function excelRound(n, digits) {
    if (isError(n)) return n;
    var x = toNumber(n);
    if (isError(x)) return x;
    var m = Math.pow(10, digits);
    var y = x * m;
    var rounded = y >= 0 ? Math.floor(y + 0.5) : Math.ceil(y - 0.5);
    return rounded / m;
  }

  function add() {
    var s = 0;
    for (var i = 0; i < arguments.length; i++) {
      var n = toNumber(arguments[i]);
      if (isError(n)) return n;
      s += n;
    }
    return s;
  }

  function sub(a, b) {
    a = toNumber(a);
    b = toNumber(b);
    if (isError(a)) return a;
    if (isError(b)) return b;
    return a - b;
  }

  function mul() {
    var s = 1;
    for (var i = 0; i < arguments.length; i++) {
      var n = toNumber(arguments[i]);
      if (isError(n)) return n;
      s *= n;
    }
    return s;
  }

  function div(a, b) {
    a = toNumber(a);
    b = toNumber(b);
    if (isError(a)) return a;
    if (isError(b)) return b;
    if (b === 0) return DIV0;
    return a / b;
  }

  function excelEqual(a, b) {
    if (isError(a)) return a;
    if (isError(b)) return b;
    if (typeof a === "string" || typeof b === "string") {
      return String(a).toLocaleLowerCase("ru") === String(b).toLocaleLowerCase("ru");
    }
    return toNumber(a) === toNumber(b);
  }

  function beginsWith(text, prefix) {
    if (isError(text)) return false;
    if (isBlank(text)) return false;
    return String(text).toLocaleLowerCase("ru").indexOf(String(prefix).toLocaleLowerCase("ru")) === 0;
  }

  function countA(values) {
    var n = 0;
    for (var i = 0; i < values.length; i++) {
      if (!isBlank(values[i]) && !isError(values[i])) n += 1;
    }
    return n;
  }

  function ifs() {
    for (var i = 0; i < arguments.length; i += 2) {
      var cond = arguments[i];
      if (isError(cond)) return cond;
      if (cond) return arguments[i + 1];
    }
    return NA;
  }

  function excelIf(cond, a, b) {
    if (isError(cond)) return cond;
    return cond ? a : b;
  }

  function formatValue(v) {
    if (v === null || v === undefined || v === "") return "";
    if (isError(v)) return v.error === DIV0.error ? "0" : v.error;
    if (typeof v === "string") return v;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) return String(v);
      if (Math.abs(v - Math.round(v)) < 1e-12) return String(Math.round(v));
      var s = v.toPrecision(12);
      if (s.indexOf("e") !== -1) return String(v);
      s = String(Number(s));
      return s;
    }
    return String(v);
  }

  function cfClass(kind) {
    if (kind === "ok") return "cf-ok";
    if (kind === "mid") return "cf-mid";
    if (kind === "bad") return "cf-bad";
    return "";
  }

  function cfForD(row, value) {
    if (isError(value)) return "bad";
    if (row === 2) {
      if (typeof value !== "number") return "";
      if (value >= 66) return "ok";
      if (value >= 60 && value <= 65) return "mid";
      return "bad";
    }
    if (row === 8 || row === 33 || row === 101 || row === 127) {
      if (beginsWith(value, "Имеется") && !beginsWith(value, "Не")) return "ok";
      if (excelEqual(value, "не имеется")) return "bad";
      return "";
    }
    if (row === 110) {
      if (typeof value !== "number") return "";
      if (value >= 51) return "ok";
      if (value >= 31) return "mid";
      return "bad";
    }
    if (row === 116) {
      if (beginsWith(value, "Принимали участие")) return "ok";
      if (beginsWith(value, "Не принимали участие")) return "bad";
      return "";
    }
    if (row === 118) {
      if (beginsWith(value, "Выше или равен")) return "ok";
      if (beginsWith(value, "Меньше")) return "bad";
      return "";
    }
    if (row === 121) {
      if (excelEqual(value, "Соответствует критериальному значению")) return "ok";
      if (excelEqual(value, "Не соответствует критериальному значению")) return "bad";
      return "";
    }
    if (row === 124) {
      if (excelEqual(value, "Соответствует критериальному значению")) return "ok";
      if (excelEqual(value, "Частично соответствует критериальному значению")) return "mid";
      if (excelEqual(value, "Не соответствует критериальному значению")) return "bad";
      return "";
    }
    if (row === 17) {
      if (typeof value !== "number") return "";
      if (value >= 70) return "ok";
      if (value >= 50 && value <= 69) return "mid";
      return "bad";
    }
    if (row === 22) {
      if (typeof value !== "number") return "";
      if (value >= 50) return "ok";
      if (value >= 30 && value <= 49) return "mid";
      return "bad";
    }
    if (row === 25 || row === 29) {
      if (excelEqual(value, "Соответствует ФГОС")) return "ok";
      if (excelEqual(value, "Не соответствует ФГОС")) return "bad";
      return "";
    }
    if (row === 38) {
      if (typeof value !== "number") return "";
      if (value >= 75) return "ok";
      if (value >= 50 && value < 75) return "mid";
      return "bad";
    }
    return "";
  }

  function cfForE(row, value) {
    if (isError(value)) return value.error === DIV0.error ? "bad" : "";
    if (row === 118 && isBlank(value)) return "bad";
    if (typeof value !== "number") return "";
    if (row === 2) {
      if (value === 10) return "ok";
      if (value === 5) return "mid";
      if (value === 0) return "bad";
    }
    if (row === 101 || row === 127) {
      if (value === 5) return "ok";
      if (value === 0) return "bad";
    }
    if (row === 8 || row === 33) {
      if (value === 10) return "ok";
      if (value === 0) return "bad";
    }
    if (row === 110) {
      if (value === 20) return "ok";
      if (value === 10) return "mid";
      if (value === 0) return "bad";
    }
    if (row === 116 || row === 118 || row === 121) {
      if (value === 10) return "ok";
      if (value === 0) return "bad";
    }
    if (row === 124) {
      if (value === 10) return "ok";
      if (value === 5) return "mid";
      if (value === 0) return "bad";
    }
    if (row === 17 || row === 22) {
      if (value === 10) return "ok";
      if (value === 5) return "mid";
      if (value === 0) return "bad";
    }
    if (row === 25 || row === 29) {
      if (value === 20) return "ok";
      if (value === 0) return "bad";
    }
    if (row === 38) {
      if (value === 20) return "ok";
      if (value === 10) return "mid";
      if (value === 0) return "bad";
    }
    return "";
  }

  function cfForTotal(total, threshold) {
    if (isError(total) || typeof total !== "number") return "bad";
    return total >= threshold ? "ok" : "bad";
  }

  /**
   * @param {object} inputs карта входных ячеек C: { "3": 15204, "9": "да", ... }
   * @param {object} enabled { AP1: true, ... }
   */
  function compute(inputs, enabled) {
    enabled = enabled || {};
    function on(code) {
      return enabled[code] !== false;
    }
    function get(row) {
      var key = String(row);
      return Object.prototype.hasOwnProperty.call(inputs, key) ? inputs[key] : "";
    }

    var C = {};
    var D = {};
    var E = {};
    var i;

    for (i = 3; i <= 43; i++) {
      if (inputs && Object.prototype.hasOwnProperty.call(inputs, String(i))) {
        C[i] = inputs[String(i)];
      }
    }

    if (on("AP1")) {
      C[2] = div(add(get(3), get(4)), mul(add(get(5), get(7)), get(6)));
      D[2] = excelRound(C[2], 0);
      E[2] = (function () {
        var d = D[2];
        if (isError(d)) return d;
        return ifs(d >= 66, 10, d < 60, 0, d >= 60 && d <= 65, 5);
      })();
    }

    if (on("AP2")) {
      C[8] = countA([get(9), get(10), get(11), get(12), get(13), get(14), get(15), get(16)]) >= 4 ? "Имеется" : "Не имеется";
      D[8] = C[8];
      E[8] = excelIf(excelEqual(D[8], "имеется"), 10, 0);
    }

    if (on("AP3")) {
      C[17] = mul(div(get(18), add(sub(get(19), get(20)), get(21))), 100);
      D[17] = excelRound(C[17], 0);
      E[17] = (function () {
        var d = D[17];
        if (isError(d)) return d;
        return ifs(d >= 70, 10, d < 50, 0, d >= 50 && d <= 69, 5);
      })();
    }

    if (on("AP4")) {
      C[22] = mul(div(get(23), get(24)), 100);
      D[22] = C[22];
      E[22] = (function () {
        var d = D[22];
        if (isError(d)) return d;
        return ifs(d >= 50, 10, d < 30, 0, d >= 30 && d <= 49, 5);
      })();
    }

    if (on("AP5")) {
      C[25] = mul(div(get(26), get(27)), 100);
      D[25] = (function () {
        var c = C[25];
        var thr = toNumber(get(28));
        if (isError(c)) return c;
        if (isError(thr)) return thr;
        return c >= thr ? "Соответствует ФГОС" : "Не соответствует ФГОС";
      })();
      E[25] = excelIf(excelEqual(D[25], "Соответствует ФГОС"), 20, 0);
    }

    if (on("AP6")) {
      C[29] = mul(div(get(30), get(31)), 100);
      D[29] = (function () {
        var c = C[29];
        var thr = toNumber(get(32));
        if (isError(c)) return c;
        if (isError(thr)) return thr;
        return c >= thr ? "Соответствует ФГОС" : "Не соответствует ФГОС";
      })();
      E[29] = excelIf(excelEqual(D[29], "Соответствует ФГОС"), 20, 0);
    }

    if (on("AP7")) {
      C[33] = countA([get(34), get(35), get(36), get(37)]) === 4 ? "Имеется" : "Не имеется";
      D[33] = C[33];
      E[33] = excelIf(excelEqual(D[33], "имеется"), 10, 0);
    }

    if (on("AP8")) {
      C[38] = mul(div(add(get(39), get(40), get(41)), sub(get(43), get(42))), 100);
      D[38] = excelRound(C[38], 0);
      E[38] = (function () {
        var d = D[38];
        if (isError(d)) return d;
        return ifs(d >= 75, 20, d < 50, 0, d >= 50 && d < 75, 10);
      })();
    }

    var total = 0;
    var scoreRows = [2, 8, 17, 22, 25, 29, 33, 38];
    for (i = 0; i < scoreRows.length; i++) {
      var ev = E[scoreRows[i]];
      if (ev === undefined || ev === null || ev === "") continue;
      if (isError(ev)) continue;
      total += toNumber(ev);
    }

    return {
      C: C,
      D: D,
      E: E,
      total: total,
    };
  }

  function computeSpo(inputs, enabled) {
    inputs = inputs || {};
    enabled = enabled || {};
    function on(code) {
      return enabled[code] !== false;
    }
    function get(row) {
      var key = String(row);
      return Object.prototype.hasOwnProperty.call(inputs, key) ? inputs[key] : "";
    }

    var C = {};
    var D = {};
    var E = {};
    var inputRows = [102, 103, 104, 105, 106, 107, 108, 109, 111, 112, 113, 114, 115, 117, 119, 120, 122, 123, 125, 126, 128, 129, 130, 131];
    var i;
    for (i = 0; i < inputRows.length; i++) {
      var row = inputRows[i];
      if (Object.prototype.hasOwnProperty.call(inputs, String(row))) C[row] = inputs[String(row)];
    }

    if (on("AP1")) {
      C[101] = countA([get(102), get(103), get(104), get(105), get(106), get(107), get(108), get(109)]) >= 4 ? "Имеется" : "Не имеется";
      D[101] = C[101];
      E[101] = excelIf(excelEqual(D[101], "имеется"), 5, 0);
    }

    if (on("AP2")) {
      C[110] = mul(div(add(get(111), get(112), get(113)), sub(get(115), get(114))), 100);
      D[110] = excelRound(C[110], 0);
      E[110] = (function () {
        var d = D[110];
        if (isError(d)) return d;
        return ifs(d >= 51, 20, d >= 31, 10, d < 31, 0);
      })();
    }

    if (on("AP3")) {
      C[116] = countA([get(117)]) > 0 ? "Принимали участие" : "Не принимали участие";
      D[116] = C[116];
      E[116] = excelIf(beginsWith(D[116], "Принимали участие"), 10, 0);
    }

    if (on("AP4")) {
      var localMedianRaw = get(119);
      var nationalMedianRaw = get(120);
      C[118] = isBlank(localMedianRaw) ? "" : toNumber(localMedianRaw);
      if (isBlank(localMedianRaw) || isBlank(nationalMedianRaw)) {
        D[118] = "";
        E[118] = "";
      } else {
        var localMedian = toNumber(localMedianRaw);
        var nationalMedian = toNumber(nationalMedianRaw);
        if (isError(localMedian) || isError(nationalMedian)) {
          D[118] = isError(localMedian) ? localMedian : nationalMedian;
          E[118] = D[118];
        } else if (localMedian >= nationalMedian) {
          D[118] = "Выше или равен медианному значению";
          E[118] = 10;
        } else {
          D[118] = "Меньше медианного значения";
          E[118] = 0;
        }
      }
    }

    if (on("AP5")) {
      C[121] = mul(div(get(122), get(123)), 100);
      D[121] = isError(C[121])
        ? C[121]
        : C[121] >= 25
          ? "Соответствует критериальному значению"
          : "Не соответствует критериальному значению";
      E[121] = isError(C[121]) ? C[121] : C[121] >= 25 ? 10 : 0;
    }

    if (on("AP6")) {
      C[124] = mul(div(get(126), get(125)), 100);
      D[124] = isError(C[124])
        ? C[124]
        : C[124] >= 25
          ? "Соответствует критериальному значению"
          : C[124] >= 10
            ? "Частично соответствует критериальному значению"
            : "Не соответствует критериальному значению";
      E[124] = isError(C[124]) ? C[124] : C[124] >= 25 ? 10 : C[124] >= 10 ? 5 : 0;
    }

    if (on("AP7")) {
      C[127] = countA([get(128), get(129), get(130), get(131)]) === 4 ? "Имеется" : "Не имеется";
      D[127] = C[127];
      E[127] = excelIf(excelEqual(D[127], "имеется"), 5, 0);
    }

    var total = 0;
    var scoreRows = [101, 110, 116, 118, 121, 124, 127];
    for (i = 0; i < scoreRows.length; i++) {
      var ev = E[scoreRows[i]];
      if (ev === undefined || ev === null || ev === "") continue;
      if (isError(ev)) continue;
      total += toNumber(ev);
    }

    return { C: C, D: D, E: E, total: total };
  }

  function spoThreshold(settings) {
    if (!settings) return null;
    if ((settings.demoExam !== "yes" && settings.demoExam !== "no") ||
        (settings.onlyGeneralSecondary !== "yes" && settings.onlyGeneralSecondary !== "no")) return null;
    return (settings.onlyGeneralSecondary === "yes" ? 25 : 35) +
      (settings.demoExam === "yes" ? 5 : 0);
  }

  root.AccredEngine = {
    CF: CF,
    DIV0: DIV0,
    isError: isError,
    isBlank: isBlank,
    toNumber: toNumber,
    excelRound: excelRound,
    countA: countA,
    formatValue: formatValue,
    cfClass: cfClass,
    cfForD: cfForD,
    cfForE: cfForE,
    cfForTotal: cfForTotal,
    compute: compute,
    computeSpo: computeSpo,
    spoThreshold: spoThreshold,
  };
})(typeof window !== "undefined" ? window : globalThis);
