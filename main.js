const SHEET_ID = "1p9QYc5FXNw6gMDdsd-FJQ2EoPPXDF4AcXXFi6QR4UX4";
const SHEET_NAME = "Scouting Data(Responses)";
const DEFAULT_TEAM_FIELD = "Team Number?";
const IGNORED_FIELDS = ["Timestamp"];
let TEAM_FIELD = DEFAULT_TEAM_FIELD;

const teamSelect = document.getElementById("teamSelect");
const statusMessage = document.getElementById("statusMessage");
const teamSummary = document.getElementById("teamSummary");
const teamTableContainer = document.getElementById("teamTableContainer");
const refreshButton = document.getElementById("refreshButton");

let formResponses = [];

async function fetchSheetData() {
  if (!SHEET_ID || SHEET_ID === "YOUR_SHEET_ID") {
    showMessage(
      "Enter your Google Sheet ID in main.js and publish the sheet to the web.",
    );
    return;
  }

  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`;
  showMessage("Loading responses from Google Sheets...");

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Fetch failed: ${response.status} ${response.statusText}`,
      );
    }

    const text = await response.text();
    const json = parseGvizJson(text);
    const rows = parseSheetRows(json.table);

    formResponses = rows;
    if (rows.length) {
      const inferredField = inferTeamField(rows);
      if (!inferredField) {
        showMessage(
          'Could not detect a team column in your sheet. Make sure one column header contains "Team".',
        );
        teamSelect.innerHTML = '<option value="">Unable to load teams</option>';
        return;
      }
      TEAM_FIELD = inferredField;
    }

    populateTeamDropdown(rows);
    showMessage(
      `Loaded ${rows.length} response(s). Team column: "${TEAM_FIELD}". Choose a team to view stats.`,
    );
  } catch (error) {
    showMessage(`Unable to load sheet data. Check the sheet ID, publish settings, and that the sheet is public.
Error: ${error.message}`);
    teamSelect.innerHTML = '<option value="">Unable to load teams</option>';
  }
}

function parseGvizJson(text) {
  const jsonStart = text.indexOf("(");
  const jsonEnd = text.lastIndexOf(")");
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("Unexpected Google Sheets response format.");
  }

  const jsonText = text.slice(jsonStart + 1, jsonEnd);
  try {
    return JSON.parse(jsonText);
  } catch (err) {
    throw new Error("Unable to parse Google Sheets response as JSON.");
  }
}

function parseSheetRows(table) {
  const headers = table.cols.map((col) => (col.label || col.id || "").trim());
  return table.rows.map((row) => {
    const item = {};
    row.c.forEach((cell, index) => {
      const key = headers[index] || `Column ${index + 1}`;
      if (isIgnoredField(key)) return;
      item[key] = cell ? cell.v : "";
    });
    return item;
  });
}

function isIgnoredField(field) {
  return IGNORED_FIELDS.some(
    (ignored) => ignored.toLowerCase() === String(field).trim().toLowerCase(),
  );
}

function inferTeamField(rows) {
  const headers = Object.keys(rows[0]);
  const candidates = headers.filter((header) => /team/i.test(header));
  if (!candidates.length) {
    return null;
  }

  const exactMatch = candidates.find(
    (header) =>
      header.trim().toLowerCase() === DEFAULT_TEAM_FIELD.toLowerCase(),
  );
  if (exactMatch) {
    return exactMatch;
  }

  const preferred = candidates.find((header) =>
    /number|no\b|id|#|num/i.test(header),
  );
  if (preferred) {
    return preferred;
  }

  const scored = candidates
    .map((header) => {
      const values = rows
        .map((row) => String(row[header] ?? "").trim())
        .filter(Boolean);
      const numericCount = values.filter(
        (value) => !Number.isNaN(Number(value.replace(/,/g, ""))),
      ).length;
      return { header, numericCount };
    })
    .sort((a, b) => b.numericCount - a.numericCount);

  return scored[0]?.header || candidates[0];
}

function populateTeamDropdown(rows) {
  const teams = [
    ...new Set(rows.map((row) => String(row[TEAM_FIELD] || "").trim())),
  ]
    .filter((team) => team)
    .sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
    );

  if (!teams.length) {
    teamSelect.innerHTML = '<option value="">No teams found in sheet</option>';
    return;
  }

  const options = [
    '<option value="">Select a team</option>',
    ...teams.map(
      (team) =>
        `<option value="${escapeHtml(team)}">${escapeHtml(team)}</option>`,
    ),
  ];
  teamSelect.innerHTML = options.join("");
}

function renderTeamStats(teamName) {
  if (!teamName) {
    teamSummary.textContent =
      "Pick a team from the dropdown to see its statistics.";
    teamTableContainer.innerHTML = "";
    return;
  }

  const teamRows = formResponses.filter(
    (row) => String(row[TEAM_FIELD] || "").trim() === teamName,
  );
  if (!teamRows.length) {
    teamSummary.textContent = `No responses found for ${teamName}.`;
    teamTableContainer.innerHTML = "";
    return;
  }

  const teamInfoHtml = buildTeamInfoSection(teamName, teamRows);
  const autoInfoHtml = buildAutoInfoSection(teamRows);
  const teleopHtml = buildTeleopSection(teamRows);
  const robotHtml = buildRobotSection(teamRows);
  teamTableContainer.innerHTML =
    teamInfoHtml + autoInfoHtml + teleopHtml + robotHtml;
  teamSummary.textContent = "";
}

function buildTeamInfoSection(teamName, teamRows) {
  const matchColumn = "Match Number?";
  const presentColumn = "Is the Team Present?";

  const matches = [
    ...new Set(
      teamRows.map((row) => String(row[matchColumn] || "")).filter(Boolean),
    ),
  ].sort();
  const presentResponses = teamRows.map((row) =>
    String(row[presentColumn] || "")
      .trim()
      .toLowerCase(),
  );
  const presentCount = presentResponses.filter((v) => v === "yes").length;
  const absentCount = presentResponses.filter((v) => v === "no").length;
  const presentStatus = presentCount > absentCount ? "Present" : "Absent";

  return `
    <div class="stats-section">
      <h3>Team Info</h3>
      <div class="stat-item">
        <strong>Team Number:</strong> ${escapeHtml(teamName)}
      </div>
      <div class="stat-item">
        <strong>Match Numbers Played:</strong> ${matches.length > 0 ? matches.join(", ") : "N/A"}
      </div>
      <div class="stat-item">
        <strong>Team Presence:</strong> ${presentStatus} (${presentCount} present, ${absentCount} absent)
      </div>
    </div>
  `;
}

function buildAutoInfoSection(teamRows) {
  const shootColumn = "Does the robot shoot?";
  const scoreColumn =
    "How much did they score in auto?? (estimate is okay, try your best :] )";
  const winColumn = "Did they win Auto?";

  const shootResponses = teamRows.map((row) =>
    String(row[shootColumn] || "")
      .trim()
      .toLowerCase(),
  );
  const shootYes = shootResponses.filter((v) => v === "yes").length;
  const shootNo = shootResponses.filter((v) => v === "no").length;
  const shootMore = shootYes > shootNo ? "Yes" : "No";

  const scores = teamRows
    .map((row) => parseFloat(String(row[scoreColumn] || "").replace(/,/g, "")))
    .filter((v) => !Number.isNaN(v));
  const avgScore =
    scores.length > 0
      ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)
      : "N/A";

  const winResponses = teamRows.map((row) =>
    String(row[winColumn] || "")
      .trim()
      .toLowerCase(),
  );
  const wins = winResponses.filter((v) => v === "yes").length;
  const losses = winResponses.filter((v) => v === "no").length;
  const ties = winResponses.filter((v) => v === "tie").length;

  return `
    <div class="stats-section">
      <h3>Auto Info</h3>
      <div class="stat-item">
        <strong>Shoots in Auto?:</strong> ${shootMore} (${shootYes} Yes, ${shootNo} No)
      </div>
      <div class="stat-item">
        <strong>Average Auto Score:</strong> ${avgScore}
      </div>
      <div class="stat-item">
        <strong>Auto Record:</strong> ${wins}W-${losses}L${ties > 0 ? `-${ties}T` : ""}
      </div>
    </div>
  `;
}

function buildTeleopSection(teamRows) {
  const bumpCol = "Bump? Trench?";
  const whereShootCol =
    'Where can/do they shoot? (if it appears they can shoot from anywhere, type "anywhere)';
  const hangCol = "Does the robot hang? (t)";
  const matchWinCol = "Did they win?";
  const finalScoreCol = "Final Score?";
  const matchCol = "Match Number?";

  // Bump / Trench (checkboxes)
  const bumpVals = [
    ...new Set(
      teamRows.flatMap((r) =>
        String(r[bumpCol] || "")
          .split(/[,;/]+/)
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ),
  ];

  // Where they shoot
  const whereVals = [
    ...new Set(
      teamRows
        .map((r) => String(r[whereShootCol] || "").trim())
        .filter(Boolean),
    ),
  ];
  const whereDisplay =
    whereVals.map((v) => v.toLowerCase()).includes("anywhere") ||
    whereVals.length >= 3
      ? "Anywhere"
      : whereVals.length
        ? whereVals.join(", ")
        : "N/A";

  // Hanging
  const hangResponses = teamRows
    .map((r) => String(r[hangCol] || "").trim())
    .filter(Boolean)
    .map((v) => v.toLowerCase());
  let hangDisplay = "N/A";
  if (hangResponses.length) {
    const noCount = hangResponses.filter((v) => v === "no").length;
    const nonNo = hangResponses.filter((v) => v !== "no");
    if (nonNo.length === 0) {
      hangDisplay = "Robot does not hang";
    } else {
      // pick most common non-no value
      const counts = {};
      nonNo.forEach((v) => (counts[v] = (counts[v] || 0) + 1));
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      hangDisplay = top ? top[0] : "N/A";
      // restore capitalization
      hangDisplay = hangDisplay === "t" ? "T" : hangDisplay;
    }
  }

  // Match record
  const matchWinResponses = teamRows.map((r) =>
    String(r[matchWinCol] || "")
      .trim()
      .toLowerCase(),
  );
  const wins = matchWinResponses.filter((v) => v === "yes").length;
  const losses = matchWinResponses.filter((v) => v === "no").length;
  const ties = matchWinResponses.filter((v) => v === "tie").length;

  // Match scores
  const scoreEntries = teamRows
    .map((r) => {
      const m = String(r[matchCol] || "").trim();
      const s = String(r[finalScoreCol] || "").trim();
      if (m && s) return `Match ${escapeHtml(m)}: ${escapeHtml(s)}`;
      return null;
    })
    .filter(Boolean);

  return `
    <div class="stats-section">
      <h3>Teleoperation Info</h3>
      <div class="stat-item">
        <strong>Bump / Trench:</strong> ${bumpVals.length ? escapeHtml(bumpVals.join(", ")) : "None"}
      </div>
      <div class="stat-item">
        <strong>Where they shoot:</strong> ${escapeHtml(whereDisplay)}
      </div>
      <div class="stat-item">
        <strong>Hang:</strong> ${escapeHtml(hangDisplay)}
      </div>
      <div class="stat-item">
        <strong>Match Record:</strong> ${wins}W-${losses}L${ties > 0 ? `-${ties}T` : ""}
      </div>
      <div class="stat-item">
        <strong>Match Scores:</strong> ${scoreEntries.length ? "<br>" + scoreEntries.join("<br>") : "N/A"}
      </div>
    </div>
  `;
}

function buildRobotSection(teamRows) {
  const hopperCol = "Hopper capacity? (enter ONLY the number, no symbols)";
  const shooterSpeedCol = "Shooter Speed?";
  const shooterAccuracyCol =
    "Shooter Accuracy? (enter a number that could represent percentage. 99 being good, and 1 being bad. do NOT include any percentage symbols, only the number.)";

  const hopperValues = teamRows
    .map((r) => parseFloat(String(r[hopperCol] || "").replace(/,/g, "")))
    .filter((v) => !Number.isNaN(v));
  const hopperAvg = hopperValues.length
    ? Math.round(hopperValues.reduce((a, b) => a + b, 0) / hopperValues.length)
    : "N/A";

  const speedVals = teamRows
    .map((r) => String(r[shooterSpeedCol] || "").trim())
    .filter(Boolean);
  let speedMode = "N/A";
  if (speedVals.length) {
    const counts = {};
    speedVals.forEach((v) => (counts[v] = (counts[v] || 0) + 1));
    speedMode = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  const accValues = teamRows
    .map((r) =>
      parseFloat(String(r[shooterAccuracyCol] || "").replace(/,/g, "")),
    )
    .filter((v) => !Number.isNaN(v));
  const accAvg = accValues.length
    ? Math.round(accValues.reduce((a, b) => a + b, 0) / accValues.length)
    : "N/A";

  return `
    <div class="stats-section">
      <h3>Robot Info</h3>
      <div class="stat-item">
        <strong>Hopper Capacity (avg):</strong> ${hopperAvg}
      </div>
      <div class="stat-item">
        <strong>Shooter Speed (most common):</strong> ${escapeHtml(speedMode)}
      </div>
      <div class="stat-item">
        <strong>Shooter Accuracy (avg):</strong> ${accAvg}
      </div>
    </div>
  `;
}

function findNumericFields(rows) {
  const numericKeys = new Set();
  rows.forEach((row) => {
    Object.entries(row).forEach(([key, value]) => {
      if (key === TEAM_FIELD) return;
      const parsed = parseFloat(String(value).replace(/,/g, ""));
      if (!Number.isNaN(parsed) && String(value).trim() !== "") {
        numericKeys.add(key);
      }
    });
  });
  return [...numericKeys];
}

function buildTeamStats(rows, numericFields) {
  const stats = {};
  numericFields.forEach((field) => {
    const values = rows
      .map((row) => parseFloat(String(row[field]).replace(/,/g, "")))
      .filter((value) => !Number.isNaN(value));
    if (!values.length) return;
    stats[field] = {
      count: values.length,
      average: values.reduce((sum, value) => sum + value, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
    };
  });
  return stats;
}

function formatSummary(teamName, count, stats) {
  const summaryLines = [`Team: ${teamName}`, `Responses: ${count}`];
  if (Object.keys(stats).length) {
    summaryLines.push("", "Numeric averages:");
    for (const [field, values] of Object.entries(stats)) {
      summaryLines.push(
        `• ${field}: avg ${values.average.toFixed(2)}, min ${values.min}, max ${values.max}`,
      );
    }
  } else {
    summaryLines.push("", "No numeric fields were detected in the responses.");
  }
  return summaryLines.join("\n");
}

function buildTable(rows) {
  const headers = Object.keys(rows[0]).filter(
    (header) => !isIgnoredField(header),
  );
  const headerRow = headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join("");
  const bodyRows = rows
    .map(
      (row) =>
        `<tr>${headers
          .map((key) => `<td>${escapeHtml(String(row[key] ?? ""))}</td>`)
          .join("")}</tr>`,
    )
    .join("");

  return `<div class="table-wrapper"><table><thead><tr>${headerRow}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showMessage(message) {
  statusMessage.textContent = message;
}

teamSelect.addEventListener("change", (event) => {
  renderTeamStats(event.target.value);
});

refreshButton.addEventListener("click", fetchSheetData);

window.addEventListener("DOMContentLoaded", fetchSheetData);
