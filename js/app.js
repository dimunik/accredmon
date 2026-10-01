(function () {
  "use strict";

  var Engine = window.AccredEngine;
  var Model = window.AccredModel;
  var STORAGE = "accredMon.v1";
  var BACKUP_FORMAT = "accredMon.backup";
  var BACKUP_VERSION = 1;

  var state = {
    programId: "bak",
    inputs: {},
    settings: { demoExam: "", onlyGeneralSecondary: "" },
  };
  var pendingBackup = null;

  function programById(id) {
    for (var i = 0; i < Model.PROGRAMS.length; i++) {
      if (Model.PROGRAMS[i].id === id) return Model.PROGRAMS[i];
    }
    return Model.PROGRAMS[0];
  }

  function indicatorsFor(p) {
    return p.indicators || Model.INDICATORS;
  }

  function emptySpoSettings() {
    return { demoExam: "", onlyGeneralSecondary: "" };
  }

  function normalizeSpoSettings(settings) {
    settings = settings || {};
    return {
      demoExam: settings.demoExam === "yes" || settings.demoExam === "no" ? settings.demoExam : "",
      onlyGeneralSecondary:
        settings.onlyGeneralSecondary === "yes" || settings.onlyGeneralSecondary === "no"
          ? settings.onlyGeneralSecondary
          : "",
    };
  }

  function indicatorEnabled(p, ind) {
    if (p.spo && ind.id === "AP3") return state.settings.onlyGeneralSecondary === "no";
    if (p.spo && ind.id === "AP4") return state.settings.demoExam === "yes";
    return !p.enabled || p.enabled[ind.id] !== false;
  }

  function enabledIndicators(p) {
    var result = {};
    indicatorsFor(p).forEach(function (ind) {
      result[ind.id] = indicatorEnabled(p, ind);
    });
    return result;
  }

  function indicatorOffNote(p, ind) {
    if (p.spo && ind.id === "AP3") {
      if (state.settings.onlyGeneralSecondary === "yes") {
        return "Не применяется при зачислении только на базе среднего общего образования";
      }
      return "Укажите основание приёма";
    }
    if (p.spo && ind.id === "AP4") {
      if (state.settings.demoExam === "no") return "Демонстрационный экзамен не предусмотрен программой";
      return "Укажите, предусмотрен ли демонстрационный экзамен";
    }
    return "Не применяется для этой программы";
  }

  function effectiveThreshold(p) {
    return p.spo ? Engine.spoThreshold(state.settings) : p.threshold;
  }

  function loadStored(programId) {
    try {
      var raw = localStorage.getItem(STORAGE);
      if (!raw) return null;
      var all = JSON.parse(raw);
      return all && all[programId] ? all[programId] : null;
    } catch (e) {
      return null;
    }
  }

  function saveStored() {
    try {
      var all = {};
      var raw = localStorage.getItem(STORAGE);
      if (raw) all = JSON.parse(raw) || {};
      var p = programById(state.programId);
      all[state.programId] = p.spo
        ? { inputs: state.inputs, settings: state.settings }
        : state.inputs;
      localStorage.setItem(STORAGE, JSON.stringify(all));
    } catch (e) {
      /* private mode */
    }
  }

  function isObjectMap(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeBackupInputs(inputs, p) {
    if (!isObjectMap(inputs)) throw new Error("значения раздела «" + p.menu + "» имеют неверный формат");
    var normalized = Model.emptyInputsFor(p);
    Object.keys(inputs).forEach(function (row) {
      if (!Object.prototype.hasOwnProperty.call(normalized, row)) {
        throw new Error("в разделе «" + p.menu + "» найдена неизвестная строка " + row);
      }
      var value = inputs[row];
      if (typeof value !== "string" && (typeof value !== "number" || !Number.isFinite(value))) {
        throw new Error("значение строки " + row + " в разделе «" + p.menu + "» имеет неверный формат");
      }
      normalized[row] = value;
    });
    return normalized;
  }

  function readBackupData() {
    var raw = localStorage.getItem(STORAGE);
    var saved = raw ? JSON.parse(raw) : {};
    if (!isObjectMap(saved)) throw new Error("сохранённые данные браузера имеют неверный формат");
    var data = {};
    Model.PROGRAMS.forEach(function (p) {
      if (p.empty) return;
      var inputs;
      var settings = emptySpoSettings();
      if (p.id === state.programId) {
        inputs = state.inputs;
        settings = state.settings;
      } else if (Object.prototype.hasOwnProperty.call(saved, p.id)) {
        var stored = saved[p.id];
        if (p.spo && isObjectMap(stored) && Object.prototype.hasOwnProperty.call(stored, "inputs")) {
          inputs = stored.inputs;
          settings = stored.settings;
        } else {
          inputs = stored;
        }
      } else {
        inputs = Model.emptyInputsFor(p);
      }
      var normalizedInputs = normalizeBackupInputs(inputs, p);
      data[p.id] = p.spo
        ? { inputs: normalizedInputs, settings: normalizeSpoSettings(settings) }
        : normalizedInputs;
    });
    return data;
  }

  function setBackupStatus(message, isError) {
    var status = document.getElementById("backup-status");
    if (!status) return;
    status.textContent = message;
    status.className = "backup-status" + (isError ? " is-error" : "");
  }

  async function downloadBackup() {
    var timestamp = new Date().toISOString();
    var filename = "accredMon-backup-" + timestamp.slice(0, 10) + ".json";
    if (typeof window.showSaveFilePicker !== "function") {
      setBackupStatus("Браузер не поддерживает выбор места сохранения резервной копии.", true);
      return;
    }

    var handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "JSON-файл",
            accept: { "application/json": [".json"] },
          },
        ],
      });
    } catch (e) {
      if (e && e.name === "AbortError") {
        setBackupStatus("Сохранение резервной копии отменено.", false);
        return;
      }
      setBackupStatus("Не удалось открыть сохранение резервной копии: " + e.message, true);
      return;
    }

    var writable;
    try {
      var backup = {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: timestamp,
        activeProgram: state.programId,
        data: readBackupData(),
      };
      var blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
      writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      setBackupStatus("Резервная копия сохранена: " + (handle.name || filename), false);
    } catch (e) {
      if (writable && typeof writable.abort === "function") {
        try {
          await writable.abort();
        } catch (abortError) {
          // Keep the original write error for the user.
        }
      }
      setBackupStatus("Не удалось сохранить резервную копию: " + e.message, true);
    }
  }

  function normalizeBackupSettings(settings) {
    if (!isObjectMap(settings)) throw new Error("условия расчёта СПО имеют неверный формат");
    var keys = ["demoExam", "onlyGeneralSecondary"];
    keys.forEach(function (key) {
      if (!Object.prototype.hasOwnProperty.call(settings, key)) {
        throw new Error("в резервной копии отсутствует параметр «" + key + "»");
      }
      if (settings[key] !== "" && settings[key] !== "yes" && settings[key] !== "no") {
        throw new Error("параметр «" + key + "» имеет недопустимое значение");
      }
    });
    Object.keys(settings).forEach(function (key) {
      if (keys.indexOf(key) === -1) throw new Error("в резервной копии найден неизвестный параметр «" + key + "»");
    });
    return { demoExam: settings.demoExam, onlyGeneralSecondary: settings.onlyGeneralSecondary };
  }

  function parseBackup(text) {
    var backup;
    try {
      backup = JSON.parse(String(text));
    } catch (e) {
      throw new Error("файл не содержит корректный JSON");
    }
    if (!isObjectMap(backup)) throw new Error("структура файла резервной копии имеет неверный формат");
    if (backup.format !== BACKUP_FORMAT) throw new Error("файл не является резервной копией этого приложения");
    if (backup.version !== BACKUP_VERSION) throw new Error("версия резервной копии не поддерживается");
    if (typeof backup.exportedAt !== "string" || !backup.exportedAt) {
      throw new Error("в резервной копии отсутствует дата выгрузки");
    }
    if (!Model.PROGRAMS.some(function (p) { return !p.empty && p.id === backup.activeProgram; })) {
      throw new Error("в резервной копии указан неизвестный раздел");
    }
    if (!isObjectMap(backup.data)) throw new Error("данные разделов имеют неверный формат");
    var data = {};
    Model.PROGRAMS.forEach(function (p) {
      if (p.empty) return;
      if (!Object.prototype.hasOwnProperty.call(backup.data, p.id)) {
        throw new Error("в резервной копии отсутствует раздел «" + p.menu + "»");
      }
      var source = backup.data[p.id];
      if (p.spo) {
        if (!isObjectMap(source) || !Object.prototype.hasOwnProperty.call(source, "inputs")) {
          throw new Error("данные раздела «" + p.menu + "» имеют неверный формат");
        }
        data[p.id] = {
          inputs: normalizeBackupInputs(source.inputs, p),
          settings: normalizeBackupSettings(source.settings),
        };
      } else {
        data[p.id] = normalizeBackupInputs(source, p);
      }
    });
    Object.keys(backup.data).forEach(function (id) {
      if (!Model.PROGRAMS.some(function (p) { return !p.empty && p.id === id; })) {
        throw new Error("в резервной копии найден неизвестный раздел «" + id + "»");
      }
    });
    return { data: data, activeProgram: backup.activeProgram };
  }

  function cancelBackupImport() {
    var dialog = document.getElementById("backup-confirmation");
    if (dialog && dialog.open) dialog.close();
    pendingBackup = null;
    setBackupStatus("Загрузка резервной копии отменена.", false);
  }

  function confirmBackupImport() {
    var backup = pendingBackup;
    var dialog = document.getElementById("backup-confirmation");
    if (dialog && dialog.open) dialog.close();
    pendingBackup = null;
    if (!backup) return;
    try {
      localStorage.setItem(STORAGE, JSON.stringify(backup.data));
    } catch (e) {
      setBackupStatus("Не удалось сохранить загруженную резервную копию: " + e.message + ".", true);
      return;
    }
    setProgram(backup.activeProgram);
    setBackupStatus("Резервная копия загружена.", false);
  }

  function onBackupFileChange(ev) {
    var input = ev.target;
    var file = input.files && input.files[0];
    if (!file) return;
    var reader;
    try {
      reader = new FileReader();
    } catch (e) {
      input.value = "";
      setBackupStatus("Браузер не поддерживает чтение файла резервной копии.", true);
      return;
    }
    reader.onerror = function () {
      input.value = "";
      setBackupStatus("Не удалось прочитать файл резервной копии.", true);
    };
    reader.onload = function () {
      var parsed;
      try {
        parsed = parseBackup(reader.result);
      } catch (e) {
        input.value = "";
        setBackupStatus("Не удалось загрузить резервную копию: " + e.message + ".", true);
        return;
      }
      var dialog = document.getElementById("backup-confirmation");
      if (!dialog) {
        input.value = "";
        setBackupStatus("Не удалось открыть подтверждение загрузки резервной копии.", true);
        return;
      }
      pendingBackup = parsed;
      input.value = "";
      try {
        dialog.showModal();
      } catch (e) {
        pendingBackup = null;
        setBackupStatus("Не удалось открыть подтверждение загрузки резервной копии.", true);
        return;
      }
      setBackupStatus("Проверьте данные и подтвердите замену сохранённых значений.", false);
    };
    try {
      reader.readAsText(file, "UTF-8");
    } catch (e) {
      input.value = "";
      setBackupStatus("Не удалось прочитать файл резервной копии.", true);
    }
  }

  function setProgram(id) {
    var p = programById(id);
    state.programId = p.id;
    if (location.hash.replace("#", "") !== p.id) {
      location.hash = p.id;
    }
    if (p.empty) {
      state.inputs = {};
      state.settings = emptySpoSettings();
      render();
      return;
    }
    var stored = loadStored(p.id);
    if (p.spo) {
      state.settings = emptySpoSettings();
      if (stored && typeof stored === "object" && Object.prototype.hasOwnProperty.call(stored, "inputs")) {
        state.inputs = stored.inputs || Model.emptyInputsFor(p);
        state.settings = normalizeSpoSettings(stored.settings);
      } else if (stored) {
        state.inputs = stored;
      } else {
        state.inputs = Model.emptyInputsFor(p);
      }
    } else {
      state.settings = emptySpoSettings();
      if (stored) state.inputs = stored;
      else state.inputs = Model.emptyInputsFor(p);
    }
    render();
  }

  function parseNumberInput(raw) {
    if (raw === null || raw === undefined) return "";
    var s = String(raw).trim();
    if (s === "") return "";
    return s;
  }

  function filterNumberInput(raw) {
    var source = String(raw);
    var filtered = "";
    var commaFound = false;
    for (var i = 0; i < source.length; i++) {
      var character = source.charAt(i);
      if (character >= "0" && character <= "9") {
        filtered += character;
      } else if (character === "," && !commaFound) {
        filtered += character;
        commaFound = true;
      }
    }
    return filtered;
  }

  function isValidNumberInput(raw) {
    return /^[0-9]*,?[0-9]*$/.test(String(raw));
  }

  function onNumberBeforeInput(ev) {
    var input = ev.target;
    var inserted = ev.data;
    if (inserted === null || inserted === undefined) {
      var transfer = ev.dataTransfer;
      if (!transfer || typeof transfer.getData !== "function") return;
      inserted = transfer.getData("text/plain");
    }
    if (typeof inserted !== "string") return;

    var raw = String(input.value);
    var selectionStart = typeof input.selectionStart === "number" ? input.selectionStart : raw.length;
    var selectionEnd = typeof input.selectionEnd === "number" ? input.selectionEnd : selectionStart;
    var clean = filterNumberInput(raw);
    var cleanStart = filterNumberInput(raw.slice(0, selectionStart)).length;
    var cleanEnd = filterNumberInput(raw.slice(0, selectionEnd)).length;
    var candidate = clean.slice(0, cleanStart) + inserted + clean.slice(cleanEnd);
    if (!isValidNumberInput(inserted) || !isValidNumberInput(candidate)) {
      if (typeof ev.preventDefault === "function") ev.preventDefault();
    }
  }

  function onNumberInput(ev) {
    var input = ev.target;
    var raw = String(input.value);
    var filtered = filterNumberInput(raw);
    if (filtered === raw) return;

    var selectionStart = typeof input.selectionStart === "number" ? input.selectionStart : null;
    var selectionEnd = typeof input.selectionEnd === "number" ? input.selectionEnd : null;
    var selectionDirection = input.selectionDirection || "none";
    input.value = filtered;
    if (
      selectionStart !== null &&
      selectionEnd !== null &&
      typeof input.setSelectionRange === "function"
    ) {
      input.setSelectionRange(
        filterNumberInput(raw.slice(0, selectionStart)).length,
        filterNumberInput(raw.slice(0, selectionEnd)).length,
        selectionDirection
      );
    }
  }

  function flagValue(on) {
    return on ? "да" : "";
  }

  function isFlagOn(v) {
    return !Engine.isBlank(v);
  }

  function currentCompute() {
    var p = programById(state.programId);
    var enabled = enabledIndicators(p);
    return p.spo
      ? Engine.computeSpo(state.inputs, enabled)
      : Engine.compute(state.inputs, enabled);
  }

  function maxPossible(p) {
    if (p.spo && state.settings.demoExam !== "yes" && state.settings.demoExam !== "no") return null;
    var sum = 0;
    indicatorsFor(p).forEach(function (ind) {
      if (indicatorEnabled(p, ind)) sum += ind.max;
    });
    return sum;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderIndicatorLinks(p, result) {
    var indicators = indicatorsFor(p);
    var html =
      '<nav class="indicator-nav" style="--indicator-count:' +
      indicators.length +
      '" aria-label="Переход к показателю">';
    indicators.forEach(function (ind) {
      var title = Model.LABELS[ind.titleRow];
      var on = indicatorEnabled(p, ind);
      var points = result.E[ind.titleRow];
      var kind = on ? Engine.cfForE(ind.titleRow, points) : "";
      var pointsText = Engine.formatValue(points);
      var scoreText = on
        ? pointsText === ""
          ? "не рассчитано"
          : pointsText + " из " + ind.max + " баллов"
        : indicatorOffNote(p, ind);
      var className = "indicator-link";
      if (on && kind) className += " " + Engine.cfClass(kind);
      if (!on) className += " is-off";
      html +=
        '<button type="button" class="' +
        className +
        '" data-target="' +
        escapeHtml(ind.id) +
        '" title="' +
        escapeHtml(title.code + " — " + scoreText) +
        '" aria-label="' +
        escapeHtml(title.code + ": " + scoreText + ". Перейти к показателю") +
        '"><span class="indicator-link-code">' +
        escapeHtml(title.code) +
        "</span></button>";
    });
    return html + "</nav>";
  }

  function renderNav() {
    var nav = document.getElementById("nav");
    nav.innerHTML = "";
    Model.PROGRAMS.forEach(function (p) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nav-btn" + (p.id === state.programId ? " is-active" : "");
      btn.setAttribute("aria-current", p.id === state.programId ? "page" : "false");
      btn.innerHTML =
        '<span class="nav-label">' +
        escapeHtml(p.menu) +
        "</span>";
      btn.addEventListener("click", function () {
        setProgram(p.id);
      });
      nav.appendChild(btn);
    });
  }

  function renderPdfExportButton() {
    return '<button type="button" class="btn" id="btn-export-pdf" title="Откроется окно печати; выберите «Сохранить в PDF» и альбомную (горизонтальную) ориентацию листа">Экспорт в PDF</button>';
  }

  function renderBackupControls() {
    return (
      '<button type="button" class="btn" id="btn-export-backup" title="Откроется окно сохранения; выберите папку и имя JSON-файла">Скачать резервную копию</button>' +
      '<button type="button" class="btn" id="btn-import-backup" title="Загрузить JSON-файл резервной копии; сохранённые данные будут заменены">Загрузить резервную копию</button>' +
      '<input id="backup-file" type="file" accept=".json,application/json" hidden aria-label="Файл резервной копии">' +
      '<p class="backup-status" id="backup-status" aria-live="polite"></p>' +
      '<dialog class="clear-confirmation" id="backup-confirmation" aria-labelledby="backup-confirmation-title" aria-describedby="backup-confirmation-description">' +
      '<h2 id="backup-confirmation-title">Загрузить резервную копию?</h2>' +
      '<p id="backup-confirmation-description">Сохранённые значения и параметры всех разделов будут заменены данными из файла.</p>' +
      '<div class="clear-confirmation-actions">' +
      '<button type="button" class="btn" id="cancel-backup">Отмена</button>' +
      '<button type="button" class="btn clear-confirmation-confirm" id="confirm-backup">Загрузить копию</button>' +
      '</div></dialog>'
    );
  }

  function renderClearConfirmationDialog() {
    return (
      '<dialog class="clear-confirmation" id="clear-confirmation" aria-labelledby="clear-confirmation-title" aria-describedby="clear-confirmation-description">' +
      '<h2 id="clear-confirmation-title">Очистить значения?</h2>' +
      '<p id="clear-confirmation-description">Будут очищены введённые значения и условия расчёта этого раздела.</p>' +
      '<div class="clear-confirmation-actions">' +
      '<button type="button" class="btn" id="cancel-clear">Отмена</button>' +
      '<button type="button" class="btn clear-confirmation-confirm" id="confirm-clear">Очистить</button>' +
      '</div></dialog>'
    );
  }

  function bindPdfExportButton() {
    var button = document.getElementById("btn-export-pdf");
    if (button) {
      button.addEventListener("click", function () {
        window.print();
      });
    }
  }

  function bindBackupControls() {
    var exportButton = document.getElementById("btn-export-backup");
    if (exportButton) exportButton.addEventListener("click", downloadBackup);
    var importButton = document.getElementById("btn-import-backup");
    var fileInput = document.getElementById("backup-file");
    var dialog = document.getElementById("backup-confirmation");
    var cancelButton = document.getElementById("cancel-backup");
    var confirmButton = document.getElementById("confirm-backup");
    if (importButton && fileInput) {
      importButton.addEventListener("click", function () {
        fileInput.click();
      });
    }
    if (fileInput) fileInput.addEventListener("change", onBackupFileChange);
    if (cancelButton) cancelButton.addEventListener("click", cancelBackupImport);
    if (confirmButton) confirmButton.addEventListener("click", confirmBackupImport);
    if (dialog) {
      dialog.addEventListener("cancel", function () {
        pendingBackup = null;
        setBackupStatus("Загрузка резервной копии отменена.", false);
      });
    }
  }

  function renderEmpty(p) {
    document.getElementById("content").innerHTML =
      '<div class="toolbar">' +
      renderPdfExportButton() +
      renderBackupControls() +
      "</div>" +
      '<section class="empty">' +
      "<h2>" +
      escapeHtml(p.title) +
      "</h2>" +
      "<p>Раздел зарезервирован.</p>" +
      "</section>";
    bindPdfExportButton();
    bindBackupControls();
  }

  function renderScore(p, result, threshold, indicatorsReady) {
    var kind = threshold === null ? "" : Engine.cfForTotal(result.total, threshold);
    var pass = kind === "ok";
    var totalClass = "score-block" + (kind ? " cf-" + kind : "");
    var possible = maxPossible(p);
    var thresholdStatus = threshold === null ? "Порог не определён" : pass ? "Не ниже порога" : "Ниже порога";
    var possibleText = possible === null ? "—" : String(possible);
    var indicatorSummary = indicatorsReady
      ? renderIndicatorLinks(p, result)
      : '<div class="score-status" role="status">Выберите оба условия программы, чтобы увидеть таблицы показателей.</div>';
    return (
      '<div class="score">' +
      '<div class="' +
      totalClass +
      '">' +
      '<div class="score-label">Итого баллов по ОП</div>' +
      '<div class="score-value">' +
      escapeHtml(Engine.formatValue(result.total)) +
      "</div>" +
      '<div class="score-status">' +
      thresholdStatus +
      "</div>" +
      "</div>" +
      '<div class="score-block">' +
      '<div class="score-label">Порог</div>' +
      '<div class="score-value">' +
      (threshold === null ? "—" : escapeHtml(threshold)) +
      "</div>" +
      '<div class="score-status">' +
      (threshold === null ? "Укажите условия программы" : "из " + escapeHtml(possibleText) + " возможных") +
      "</div>" +
      "</div>" +
      '<div class="score-block indicator-score-block">' +
      '<div class="score-label">Показатели</div>' +
      indicatorSummary +
      "</div>" +
      "</div>"
    );
  }

  function renderProgramSettings(p) {
    if (!p.spo) return "";
    var demoExam = state.settings.demoExam;
    var general = state.settings.onlyGeneralSecondary;
    return (
      '<section class="program-settings" aria-label="Условия расчёта итогового порога">' +
      "<h3>Условия программы для расчёта порога</h3>" +
      '<label class="program-setting"><span>Демонстрационный экзамен</span><select data-setting="demoExam" aria-label="Предусмотрен ли демонстрационный экзамен">' +
      '<option value=""' + (demoExam === "" ? " selected" : "") + ">Выберите</option>" +
      '<option value="yes"' + (demoExam === "yes" ? " selected" : "") + ">Предусмотрен</option>" +
      '<option value="no"' + (demoExam === "no" ? " selected" : "") + ">Не предусмотрен</option>" +
      "</select></label>" +
      '<label class="program-setting"><span>Основание приёма</span><select data-setting="onlyGeneralSecondary" aria-label="Основание приёма на программу">' +
      '<option value=""' + (general === "" ? " selected" : "") + ">Выберите</option>" +
      '<option value="yes"' + (general === "yes" ? " selected" : "") + ">Среднее общее образование</option>" +
      '<option value="no"' + (general === "no" ? " selected" : "") + ">Основное общее образование</option>" +
      "</select></label>" +
      "</section>"
    );
  }

  function renderNumberInput(row, enabled) {
    var v = state.inputs[String(row)];
    var shown = v === undefined || v === null ? "" : String(v).replace(".", ",");
    return (
      '<input class="val" type="text" inputmode="decimal" data-row="' +
      row +
      '" value="' +
      escapeHtml(shown) +
      '"' +
      (enabled ? "" : " disabled") +
      ' aria-label="Значение строки ' +
      row +
      '">'
    );
  }

  function renderFlag(row, enabled) {
    var on = isFlagOn(state.inputs[String(row)]);
    return (
      '<label class="flag"><input type="checkbox" data-row="' +
      row +
      '"' +
      (on ? " checked" : "") +
      (enabled ? "" : " disabled") +
      "> имеется</label>"
    );
  }

  function renderIndicator(p, ind, result) {
    var on = indicatorEnabled(p, ind);
    var title = Model.LABELS[ind.titleRow];
    var c = result.C[ind.titleRow];
    var d = result.D[ind.titleRow];
    var e = result.E[ind.titleRow];
    var eKind = on ? Engine.cfForE(ind.titleRow, e) : "";
    var summaryClass = "summary-row" + (eKind ? " " + Engine.cfClass(eKind) : "");
    var rows = "";
    ind.inputRows.forEach(function (row) {
      var lab = Model.LABELS[row];
      var valCell =
        ind.inputKind === "flag" ? renderFlag(row, on) : renderNumberInput(row, on);
      rows +=
        "<tr>" +
        '<td class="num">—</td>' +
        "<td>" +
        escapeHtml(lab.b) +
        "</td>" +
        "<td>" +
        valCell +
        "</td>" +
        "<td></td>" +
        "<td></td>" +
        "</tr>";
    });
    var sourceNote = "";
    if (on && ((ind.id === "AP1" && !p.spo) || (ind.id === "AP4" && p.spo))) {
      sourceNote =
        '<div class="row-note">Значение показателя вносится Рособрнадзором самостоятельно</div>';
    }
    var indicatorNote = ind.note && on
      ? '<p class="hint">' + escapeHtml(ind.note) + "</p>"
      : "";
    var flagHint = "";
    if (ind.inputKind === "flag" && on) {
      var filled = 0;
      ind.inputRows.forEach(function (row) {
        if (isFlagOn(state.inputs[String(row)])) filled += 1;
      });
      flagHint =
        '<p class="hint">Отмечено ' +
        filled +
        " из " +
        ind.inputRows.length +
        (ind.flagNeed ? " (для «Имеется» нужно " + (ind.id === "AP7" ? "ровно " : "не менее ") + ind.flagNeed + ")" : "") +
        ".</p>";
    }
    return (
      '<section class="indicator' +
      (on ? "" : " is-off") +
      '" id="' +
      ind.id +
      '">' +
      '<div class="table-wrap"><table class="sheet">' +
      "<colgroup><col class='c-code'><col class='c-name'><col class='c-val'><col class='c-out'><col class='c-pts'></colgroup>" +
      "<thead><tr><th>Код</th><th>Наименование</th><th>Значения</th><th>Итоговое значение в системе</th><th>Баллы</th></tr></thead>" +
      "<tbody>" +
      '<tr class="' +
      summaryClass +
      '">' +
      '<td class="num">' +
      escapeHtml(title.code) +
      "</td>" +
      "<td>" +
      escapeHtml(title.b) +
      sourceNote +
      (on
        ? ""
        : '<div class="ind-off-note">' + escapeHtml(indicatorOffNote(p, ind)) + "</div>") +
      "</td>" +
      '<td class="cell-out">' +
      (on ? escapeHtml(Engine.formatValue(c)) : "") +
      "</td>" +
      '<td class="cell-out">' +
      (on ? escapeHtml(Engine.formatValue(d)) : "") +
      "</td>" +
      '<td class="cell-pts">' +
      (on ? escapeHtml(Engine.formatValue(e)) + " / " + ind.max : "—") +
      "</td>" +
      "</tr>" +
      rows +
      "</tbody></table></div>" +
      indicatorNote +
      flagHint +
      "</section>"
    );
  }

  function render() {
    var y = window.scrollY;
    renderNav();
    var p = programById(state.programId);
    var content = document.getElementById("content");
    if (p.empty) {
      document.getElementById("topbar").innerHTML =
        "<div><h2>" + escapeHtml(p.title) + "</h2></div>";
      renderEmpty(p);
      return;
    }
    var threshold = effectiveThreshold(p);
    var indicatorsReady = !p.spo || threshold !== null;
    var result = currentCompute();
    document.getElementById("topbar").innerHTML =
      "<div><h2>" +
      escapeHtml(p.title) +
      "</h2></div>" +
      renderScore(p, result, threshold, indicatorsReady);

    var html = '<div class="toolbar">';
    html +=
      renderPdfExportButton() +
      renderBackupControls() +
      '<button type="button" class="btn" id="btn-clear">Очистить значения</button>' +
      "</div>";
    html += renderProgramSettings(p);
    if (indicatorsReady) {
      indicatorsFor(p).forEach(function (ind) {
        html += renderIndicator(p, ind, result);
      });
    }
    html += renderClearConfirmationDialog();
    content.innerHTML = html;
    bindPdfExportButton();
    bindBackupControls();

    document.querySelectorAll(".indicator-link").forEach(function (el) {
      el.addEventListener("click", function () {
        var target = document.getElementById(el.getAttribute("data-target"));
        if (!target) return;
        var topbar = document.getElementById("topbar");
        var offset = topbar ? topbar.getBoundingClientRect().height + 16 : 0;
        var top =
          target.getBoundingClientRect().top +
          (window.scrollY || window.pageYOffset || 0) -
          offset;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      });
    });

    var clearDialog = document.getElementById("clear-confirmation");
    document.getElementById("btn-clear").addEventListener("click", function () {
      clearDialog.showModal();
    });
    document.getElementById("cancel-clear").addEventListener("click", function () {
      clearDialog.close();
    });
    document.getElementById("confirm-clear").addEventListener("click", function () {
      clearDialog.close();
      state.inputs = Model.emptyInputsFor(p);
      if (p.spo) state.settings = emptySpoSettings();
      saveStored();
      render();
    });

    content.querySelectorAll("input.val").forEach(function (el) {
      el.addEventListener("beforeinput", onNumberBeforeInput);
      el.addEventListener("input", onNumberInput);
      el.addEventListener("change", onNumberChange);
      el.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          el.blur();
        }
      });
    });
    content.querySelectorAll('input[type="checkbox"][data-row]').forEach(function (el) {
      el.addEventListener("change", onFlagChange);
    });
    content.querySelectorAll("select[data-setting]").forEach(function (el) {
      el.addEventListener("change", onSettingChange);
    });
    window.scrollTo(0, y);
  }

  function focusTargetFor(element) {
    if (!element || typeof element.getAttribute !== "function") return null;
    var row = element.getAttribute("data-row");
    if (row !== null && row !== "") {
      if (element.getAttribute("type") === "checkbox") {
        return { selector: 'input[type="checkbox"][data-row="' + row + '"]' };
      }
      return {
        selector: 'input.val[data-row="' + row + '"]',
        selectionStart: typeof element.selectionStart === "number" ? element.selectionStart : null,
        selectionEnd: typeof element.selectionEnd === "number" ? element.selectionEnd : null,
        selectionDirection: element.selectionDirection || "none",
      };
    }
    var setting = element.getAttribute("data-setting");
    if (setting) return { selector: 'select[data-setting="' + setting + '"]' };
    return null;
  }

  function renderPreservingFocus() {
    var active = document.activeElement;
    var target = focusTargetFor(active);
    render();
    if (!target) return;
    var replacement = document.querySelector(target.selector);
    if (!replacement) return;
    replacement.focus();
    if (
      typeof target.selectionStart === "number" &&
      typeof target.selectionEnd === "number" &&
      typeof replacement.setSelectionRange === "function"
    ) {
      replacement.setSelectionRange(
        target.selectionStart,
        target.selectionEnd,
        target.selectionDirection
      );
    }
  }

  function onNumberChange(ev) {
    var row = ev.target.getAttribute("data-row");
    var raw = parseNumberInput(ev.target.value);
    if (raw === "") {
      state.inputs[row] = "";
    } else {
      var normalized = raw.replace(/\s/g, "").replace(",", ".");
      var n = Number(normalized);
      state.inputs[row] = Number.isFinite(n) ? n : raw;
    }
    saveStored();
    window.setTimeout(renderPreservingFocus, 0);
  }

  function onFlagChange(ev) {
    var row = ev.target.getAttribute("data-row");
    state.inputs[row] = flagValue(ev.target.checked);
    saveStored();
    render();
  }

  function onSettingChange(ev) {
    var key = ev.target.getAttribute("data-setting");
    var value = ev.target.value;
    if (key !== "demoExam" && key !== "onlyGeneralSecondary") return;
    if (value !== "" && value !== "yes" && value !== "no") return;
    state.settings[key] = value;
    saveStored();
    render();
    var again = document.querySelector('select[data-setting="' + key + '"]');
    if (again) again.focus();
  }

  function boot() {
    var hash = (location.hash || "").replace("#", "");
    var initial = hash && programById(hash).id === hash ? hash : "bak";
    setProgram(initial);
    window.addEventListener("hashchange", function () {
      var id = (location.hash || "").replace("#", "") || "bak";
      if (id !== state.programId) setProgram(id);
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
