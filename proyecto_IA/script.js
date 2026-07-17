const AppState = {
  rawUsers: [],
  filteredUsers: [],
  isSearchActive: false,
  firebaseUrl: 'https://proyecto2-7faed-default-rtdb.firebaseio.com/.json'
};

document.addEventListener("DOMContentLoaded", () => {
  initializeDashboard();
});

async function initializeDashboard() {
  const data = await fetchDashboardData(AppState.firebaseUrl);
  
  if (data && data.length > 0) {
    renderResumenView();
    renderClientesView(AppState.rawUsers);
    renderAnaliticoView(AppState.rawUsers);
    setupNavigation();
    setupSearchEngine();
  } else {
    showSystemNotification("ERROR: Data stream empty.", "critical");
  }
}

async function fetchDashboardData(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP System Error! Status: ${response.status}`);
    }
    const data = await response.json();
    AppState.rawUsers = sanitizeFirebaseData(data);
    AppState.filteredUsers = [...AppState.rawUsers];
    return AppState.rawUsers;
  } catch (error) {
    console.error("❌ Error en Firebase:", error);
    renderErrorMessage("CRITICAL ERROR: Firewalls blocked the database stream.");
    return null;
  }
}

function sanitizeFirebaseData(data) {
  if (!data) return [];
  return Array.isArray(data) ? data.filter(Boolean) : Object.values(data);
}

function getAmountSpent(user) {
  if (!user) return 0;
  const rawAmount = user["Amount Spent ($)"] ?? user["Amount Spent"] ?? user["amountSpent"] ?? 0;
  if (typeof rawAmount === 'string') {
    return parseFloat(rawAmount.replace(/[^0-9.-]+/g, "")) || 0;
  }
  return Number(rawAmount);
}

function getTopSpenders(users) {
  return [...users]
    .sort((a, b) => getAmountSpent(b) - getAmountSpent(a))
    .slice(0, 10);
}

function setupNavigation() {
  const navLinks = {
    "nav-resumen": "view-resumen",
    "nav-clientes": "view-clientes",
    "nav-analitico": "view-analitico"
  };

  Object.keys(navLinks).forEach(navId => {
    const linkElement = document.getElementById(navId);
    if (linkElement) {
      linkElement.addEventListener("click", (e) => {
        e.preventDefault();
        
        Object.keys(navLinks).forEach(id => {
          document.getElementById(id).classList.remove("active");
          document.getElementById(navLinks[id]).classList.add("hidden");
        });

        linkElement.classList.add("active");
        document.getElementById(navLinks[navId]).classList.remove("hidden");
      });
    }
  });
}

function renderResumenView() {
  const tableBody = document.getElementById("table-body-resumen");
  if (!tableBody) return;

  const topSpenders = getTopSpenders(AppState.rawUsers);
  let htmlBuffer = "";

  topSpenders.forEach((user, index) => {
    const amount = getAmountSpent(user);
    const membership = (user["Membership Status"] || "Bronze").trim();
    
    htmlBuffer += `
      <tr class="table-row">
        <td class="cell-rank">#${index + 1}</td>
        <td class="cell-name">${escapeHTML(user.Name || "Unknown Unit")}</td>
        <td class="cell-city">${escapeHTML(user.City || "N/A")}</td>
        <td class="cell-membership"><span class="badge badge-${membership.toLowerCase()}">${membership}</span></td>
        <td class="cell-amount text-neon">${formatCurrency(amount)}</td>
      </tr>
    `;
  });

  tableBody.innerHTML = htmlBuffer;
}

function renderClientesView(usersList) {
  const tableBody = document.getElementById("table-body-clientes");
  if (!tableBody) return;

  if (usersList.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" class="no-results">SYSTEM ERROR: No records found.</td></tr>`;
    return;
  }

  let htmlBuffer = "";
  usersList.forEach((user) => {
    const amount = getAmountSpent(user);
    const membership = (user["Membership Status"] || "Bronze").trim();
    const customerId = user["Customer ID"] || "N/A";
    const email = user["Email"] || user["email"] || "N/A";
    
    htmlBuffer += `
      <tr class="table-row">
        <td class="cell-rank">${escapeHTML(customerId)}</td>
        <td class="cell-name">${escapeHTML(user.Name || "Unknown Unit")}</td>
        <td class="cell-email" style="color: #8892b0;">${escapeHTML(email)}</td>
        <td class="cell-city">${escapeHTML(user.City || "N/A")}</td>
        <td class="cell-membership"><span class="badge badge-${membership.toLowerCase()}">${membership}</span></td>
        <td class="cell-amount text-neon">${formatCurrency(amount)}</td>
      </tr>
    `;
  });

  tableBody.innerHTML = htmlBuffer;
}

function renderAnaliticoView(dataset) {
  renderMembershipChart(dataset);

  const cityMap = {};
  const paymentMap = {};

  dataset.forEach(user => {
    const city = user.City || "Unknown Sector";
    const payment = user["Payment Method"] || user["paymentMethod"] || "Offline/Cash";
    
    cityMap[city] = (cityMap[city] || 0) + 1;
    paymentMap[payment] = (paymentMap[payment] || 0) + 1;
  });

  renderProgressBars(cityMap, document.getElementById("cities-progress-container"));
  renderProgressBars(paymentMap, document.getElementById("payments-progress-container"));
}

function renderMembershipChart(users) {
  const chartElement = document.getElementById("membership-dona-chart");
  if (!chartElement) return;

  const totals = { Gold: 0, Silver: 0, Bronze: 0 };
  users.forEach(u => {
    const status = (u["Membership Status"] || "Bronze").trim();
    if (totals[status] !== undefined) totals[status]++;
  });

  const grandTotal = totals.Gold + totals.Silver + totals.Bronze || 1;
  
  const goldPct = (totals.Gold / grandTotal) * 100;
  const silverPct = (totals.Silver / grandTotal) * 100;
  const bronzePct = (totals.Bronze / grandTotal) * 100;

  const goldAngle = (goldPct * 3.6).toFixed(1);
  const silverAngle = ((goldPct + silverPct) * 3.6).toFixed(1);

  chartElement.style.background = `conic-gradient(
    #ff007f 0deg ${goldAngle}deg,
    #00f0ff ${goldAngle}deg ${silverAngle}deg,
    #7f00ff ${silverAngle}deg 360deg
  )`;

  updateChartLegend(goldPct, silverPct, bronzePct, totals);
}

function renderProgressBars(frequencyMap, container) {
  if (!container) return;
  
  const entries = Object.entries(frequencyMap).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    container.innerHTML = `<div class="no-data">No active logs.</div>`;
    return;
  }

  const maxValue = entries[0][1] || 1;

  let htmlBuffer = "";
  entries.forEach(([key, value]) => {
    const percentage = ((value / maxValue) * 100).toFixed(1);
    htmlBuffer += `
      <div class="bar-item">
        <div class="bar-label">
          <span>${escapeHTML(key)}</span>
          <span class="text-neon-cyan">${value} px</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width: ${percentage}%"></div>
        </div>
      </div>
    `;
  });

  container.innerHTML = htmlBuffer;
}

function setupSearchEngine() {
  const searchInput = document.getElementById("cyberpunk-search-input");
  if (!searchInput) return;

  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.trim().toLowerCase();

    if (query === "") {
      AppState.isSearchActive = false;
      renderClientesView(AppState.rawUsers);
    } else {
      AppState.isSearchActive = true;
      AppState.filteredUsers = AppState.rawUsers.filter(user => {
        const name = (user.Name || "").toLowerCase();
        const city = (user.City || "").toLowerCase();
        return name.includes(query) || city.includes(query);
      });
      renderClientesView(AppState.filteredUsers);
    }
  });
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}


function updateChartLegend(gold, silver, bronze, rawTotals) {
  const gLabel = document.getElementById("legend-gold-pct");
  const sLabel = document.getElementById("legend-silver-pct");
  const bLabel = document.getElementById("legend-bronze-pct");

  if (gLabel) gLabel.textContent = `${gold.toFixed(0)}% (${rawTotals.Gold})`;
  if (sLabel) sLabel.textContent = `${silver.toFixed(0)}% (${rawTotals.Silver})`;
  if (bLabel) bLabel.textContent = `${bronze.toFixed(0)}% (${rawTotals.Bronze})`;
}

function renderErrorMessage(message) {
  const tableBody = document.getElementById("table-body-resumen");
  if (tableBody) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="cell-system-error">
          <div class="glitch-text" data-text="${message}">${message}</div>
        </td>
      </tr>
    `;
  }
}

function showSystemNotification(msg, type) {
  console.warn(`[NOTIFICACTION] [${type.toUpperCase()}]: ${msg}`);
}