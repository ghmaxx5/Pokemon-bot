const fs = require("fs");
const path = require("path");
const url = require("url");
const { pool } = require("../database");

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "cybermon-admin";

async function handleAdminRequest(req, res, client) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Set default CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Helper to respond with JSON
  const sendJSON = (statusCode, data) => {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };

  // Helper to verify token
  const verifyToken = () => {
    const authHeader = req.headers["authorization"];
    if (!authHeader) return false;
    const token = authHeader.replace("Bearer ", "").trim();
    return token === ADMIN_TOKEN;
  };

  // Serve static dashboard HTML
  if (pathname === "/admin" || pathname === "/admin/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(getAdminHtml());
    return;
  }

  // --- API Routes ---

  // Verify auth token endpoint (for frontend check)
  if (pathname === "/api/admin/verify" && method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        if (data.token === ADMIN_TOKEN) {
          sendJSON(200, { success: true, message: "Authorized" });
        } else {
          sendJSON(401, { success: false, message: "Invalid token" });
        }
      } catch (e) {
        sendJSON(400, { success: false, message: "Invalid request payload" });
      }
    });
    return;
  }

  // Get Users list & Stats (Requires Auth)
  if (pathname === "/api/admin/users" && method === "GET") {
    if (!verifyToken()) {
      sendJSON(401, { success: false, message: "Unauthorized. Invalid admin token." });
      return;
    }

    try {
      // 1. Fetch Stats
      const totalUsersRes = await pool.query("SELECT COUNT(*) FROM users");
      const bannedUsersRes = await pool.query("SELECT COUNT(*) FROM users WHERE banned = TRUE");
      const totalPokemonRes = await pool.query("SELECT COUNT(*) FROM pokemon");
      const totalBalanceRes = await pool.query("SELECT SUM(balance) FROM users");

      const stats = {
        totalUsers: parseInt(totalUsersRes.rows[0].count) || 0,
        bannedUsers: parseInt(bannedUsersRes.rows[0].count) || 0,
        totalPokemon: parseInt(totalPokemonRes.rows[0].count) || 0,
        totalBalance: parseInt(totalBalanceRes.rows[0].sum) || 0
      };

      // 2. Fetch User List
      const usersQuery = `
        SELECT 
          u.user_id, 
          u.username, 
          u.balance, 
          u.banned, 
          u.ban_reason, 
          u.banned_at,
          u.created_at,
          COUNT(p.id) as pokemon_count 
        FROM users u 
        LEFT JOIN pokemon p ON u.user_id = p.user_id 
        GROUP BY u.user_id 
        ORDER BY u.created_at DESC
      `;
      const usersRes = await pool.query(usersQuery);

      // Try to resolve usernames & avatars via Discord cache/API for richer info
      const users = await Promise.all(usersRes.rows.map(async (row) => {
        let avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
        let discordTag = row.username || `User #${row.user_id}`;
        
        try {
          const discUser = client.users.cache.get(row.user_id) || await client.users.fetch(row.user_id);
          if (discUser) {
            discordTag = discUser.tag;
            avatarUrl = discUser.displayAvatarURL({ dynamic: true, size: 64 }) || avatarUrl;
          }
        } catch (err) {
          // Fallback to DB info if discord fetch fails
        }

        return {
          userId: row.user_id,
          username: discordTag,
          avatarUrl: avatarUrl,
          balance: parseInt(row.balance) || 0,
          banned: row.banned || false,
          banReason: row.ban_reason || "",
          bannedAt: row.banned_at,
          createdAt: row.created_at,
          pokemonCount: parseInt(row.pokemon_count) || 0
        };
      }));

      sendJSON(200, { success: true, stats, users });
    } catch (err) {
      console.error("Admin dashboard fetch error:", err);
      sendJSON(500, { success: false, message: "Database query failed." });
    }
    return;
  }

  // Ban/Unban a User (Requires Auth)
  if (pathname === "/api/admin/ban" && method === "POST") {
    if (!verifyToken()) {
      sendJSON(401, { success: false, message: "Unauthorized. Invalid admin token." });
      return;
    }

    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        const { userId, action, reason } = JSON.parse(body);
        if (!userId) {
          sendJSON(400, { success: false, message: "Missing User ID." });
          return;
        }

        const isBan = action === "ban";
        const banReason = isBan ? (reason || "Violating terms of service.") : null;
        const bannedAt = isBan ? new Date() : null;

        // Verify if user exists in database first
        const userCheck = await pool.query("SELECT user_id FROM users WHERE user_id = $1", [userId]);
        if (userCheck.rows.length === 0) {
          // If they haven't run c!start yet, register them in DB so we can record the ban
          await pool.query(
            "INSERT INTO users (user_id, username, banned, ban_reason, banned_at) VALUES ($1, $2, $3, $4, $5)",
            [userId, "Unknown (Banned before starting)", isBan, banReason, bannedAt]
          );
        } else {
          // Update existing user
          await pool.query(
            "UPDATE users SET banned = $1, ban_reason = $2, banned_at = $3 WHERE user_id = $4",
            [isBan, banReason, bannedAt, userId]
          );
        }

        sendJSON(200, { 
          success: true, 
          message: `User ${userId} has been successfully ${isBan ? "banned" : "unbanned"}.` 
        });
      } catch (err) {
        console.error("Admin ban API error:", err);
        sendJSON(500, { success: false, message: "Failed to update ban status in database." });
      }
    });
    return;
  }

  // Fallback
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
}

function getAdminHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cybermon Admin Dashboard</title>
  <!-- Google Fonts Inter & Outfit -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  
  <style>
    :root {
      --bg-color: #08090c;
      --panel-bg: rgba(13, 17, 23, 0.6);
      --border-color: rgba(255, 255, 255, 0.08);
      --accent-color: #8b5cf6;
      --accent-glow: rgba(139, 92, 246, 0.4);
      --text-color: #f3f4f6;
      --text-muted: #9ca3af;
      --success-color: #10b981;
      --danger-color: #ef4444;
      --font-primary: 'Inter', sans-serif;
      --font-header: 'Outfit', sans-serif;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-color);
      color: var(--text-color);
      font-family: var(--font-primary);
      overflow-x: hidden;
      min-height: 100vh;
      background-image: 
        radial-gradient(circle at 10% 20%, rgba(139, 92, 246, 0.15) 0%, transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(59, 130, 246, 0.1) 0%, transparent 45%);
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem 1.5rem;
    }

    /* Glassmorphism Panel styles */
    .glass-panel {
      background: var(--panel-bg);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5);
    }

    /* Auth Overlay */
    #auth-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(8, 9, 12, 0.95);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.3s ease;
    }

    .auth-card {
      width: 100%;
      max-width: 400px;
      padding: 2.5rem;
      text-align: center;
    }

    .auth-title {
      font-family: var(--font-header);
      font-size: 1.8rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, #a78bfa, #3b82f6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .auth-subtitle {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-bottom: 2rem;
    }

    .input-group {
      margin-bottom: 1.5rem;
      position: relative;
      text-align: left;
    }

    .input-label {
      display: block;
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
      color: var(--text-muted);
    }

    .styled-input {
      width: 100%;
      padding: 0.8rem 1rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      color: white;
      font-family: var(--font-primary);
      font-size: 1rem;
      transition: all 0.2s ease;
    }

    .styled-input:focus {
      outline: none;
      border-color: var(--accent-color);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }

    .primary-btn {
      width: 100%;
      padding: 0.8rem 1.5rem;
      background: linear-gradient(135deg, var(--accent-color), #4f46e5);
      border: none;
      border-radius: 8px;
      color: white;
      font-family: var(--font-header);
      font-weight: 600;
      font-size: 1rem;
      cursor: pointer;
      transition: transform 0.1s ease, box-shadow 0.2s ease;
      box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
    }

    .primary-btn:hover {
      box-shadow: 0 6px 16px rgba(139, 92, 246, 0.5);
      transform: translateY(-1px);
    }

    .primary-btn:active {
      transform: translateY(1px);
    }

    /* Main Header */
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }

    .logo-container {
      display: flex;
      align-items: center;
      gap: 0.8rem;
    }

    .logo-icon {
      font-size: 2.2rem;
      background: linear-gradient(135deg, #f43f5e, #8b5cf6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: pulse 3s infinite alternate;
    }

    .brand-name {
      font-family: var(--font-header);
      font-size: 1.8rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }

    .brand-subtitle {
      font-size: 0.75rem;
      color: var(--accent-color);
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.1em;
      margin-top: -4px;
    }

    .logout-btn {
      padding: 0.5rem 1rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      color: var(--text-color);
      font-family: var(--font-primary);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .logout-btn:hover {
      background: rgba(239, 68, 68, 0.1);
      border-color: rgba(239, 68, 68, 0.4);
      color: var(--danger-color);
    }

    /* Stats Grid */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.2rem;
      margin-bottom: 2rem;
    }

    .stat-card {
      padding: 1.5rem;
      position: relative;
      overflow: hidden;
    }

    .stat-card::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 4px;
      background: var(--accent-color);
      opacity: 0.6;
    }

    .stat-card.banned::after {
      background: var(--danger-color);
    }

    .stat-label {
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
    }

    .stat-value {
      font-family: var(--font-header);
      font-size: 2.2rem;
      font-weight: 800;
    }

    /* Dashboard Content area */
    .dashboard-panel {
      padding: 1.5rem;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .panel-title {
      font-family: var(--font-header);
      font-size: 1.3rem;
      font-weight: 700;
    }

    .search-wrapper {
      position: relative;
      width: 100%;
      max-width: 320px;
    }

    .search-input {
      width: 100%;
      padding: 0.6rem 1rem 0.6rem 2.5rem;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      color: white;
      font-size: 0.9rem;
      transition: all 0.2s ease;
    }

    .search-input:focus {
      outline: none;
      border-color: var(--accent-color);
    }

    .search-icon {
      position: absolute;
      left: 0.9rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-muted);
      font-size: 0.95rem;
    }

    /* Table styles */
    .table-container {
      overflow-x: auto;
      border-radius: 8px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    th {
      background: rgba(255, 255, 255, 0.02);
      padding: 1rem;
      font-size: 0.75rem;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border-color);
    }

    td {
      padding: 1rem;
      font-size: 0.9rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      vertical-align: middle;
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.01);
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .user-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #1e293b;
      object-fit: cover;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .user-details {
      display: flex;
      flex-direction: column;
    }

    .user-name {
      font-weight: 600;
    }

    .user-id {
      font-size: 0.75rem;
      color: var(--text-muted);
      cursor: pointer;
      transition: color 0.1s ease;
    }

    .user-id:hover {
      color: var(--accent-color);
      text-decoration: underline;
    }

    /* Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .badge-success {
      background: rgba(16, 185, 129, 0.1);
      color: var(--success-color);
      border: 1px solid rgba(16, 185, 129, 0.2);
    }

    .badge-danger {
      background: rgba(239, 68, 68, 0.1);
      color: var(--danger-color);
      border: 1px solid rgba(239, 68, 68, 0.2);
    }

    .ban-reason-text {
      font-size: 0.8rem;
      color: var(--text-muted);
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Action buttons */
    .btn {
      padding: 0.4rem 0.8rem;
      font-size: 0.8rem;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      font-family: var(--font-primary);
      transition: all 0.2s ease;
    }

    .btn-action-ban {
      background: rgba(239, 68, 68, 0.08);
      color: var(--danger-color);
      border: 1px solid rgba(239, 68, 68, 0.2);
    }

    .btn-action-ban:hover {
      background: var(--danger-color);
      color: white;
    }

    .btn-action-unban {
      background: rgba(16, 185, 129, 0.08);
      color: var(--success-color);
      border: 1px solid rgba(16, 185, 129, 0.2);
    }

    .btn-action-unban:hover {
      background: var(--success-color);
      color: white;
    }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      z-index: 500;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.25s ease;
    }

    .modal-overlay.active {
      opacity: 1;
      pointer-events: auto;
    }

    .modal-card {
      width: 100%;
      max-width: 450px;
      padding: 2rem;
      transform: scale(0.9);
      transition: transform 0.25s ease;
    }

    .modal-overlay.active .modal-card {
      transform: scale(1);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.2rem;
    }

    .modal-close {
      cursor: pointer;
      font-size: 1.5rem;
      color: var(--text-muted);
      transition: color 0.1s ease;
    }

    .modal-close:hover {
      color: white;
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.8rem;
      margin-top: 1.5rem;
    }

    .btn-cancel {
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--text-color);
    }

    .btn-cancel:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    .loader {
      display: inline-block;
      width: 1.5rem;
      height: 1.5rem;
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-radius: 50%;
      border-top-color: var(--accent-color);
      animation: spin 1s ease-in-out infinite;
    }

    /* Toast Notification */
    .toast {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      font-weight: 500;
      z-index: 1000;
      transform: translateY(100px);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }

    .toast.active {
      transform: translateY(0);
      opacity: 1;
    }

    .toast-success {
      background: var(--success-color);
      color: white;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    }

    .toast-error {
      background: var(--danger-color);
      color: white;
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @keyframes pulse {
      from { transform: scale(1); filter: brightness(1); }
      to { transform: scale(1.05); filter: brightness(1.2); }
    }

    /* Responsive */
    @media (max-width: 768px) {
      .panel-header {
        flex-direction: column;
        align-items: stretch;
      }
      .search-wrapper {
        max-width: 100%;
      }
      .stats-grid {
        grid-template-columns: 1fr 1fr;
      }
    }

    @media (max-width: 480px) {
      .stats-grid {
        grid-template-columns: 1fr;
      }
      .container {
        padding: 1rem 0.75rem;
      }
    }
  </style>
</head>
<body>

  <!-- Auth Overlay -->
  <div id="auth-overlay">
    <div class="auth-card glass-panel">
      <div class="auth-title">Cybermon Admin</div>
      <div class="auth-subtitle">Enterprise Administration Hub</div>
      <div class="input-group">
        <label class="input-label">Security Token</label>
        <input type="password" id="auth-token-input" class="styled-input" placeholder="••••••••••••" onkeydown="if(event.key==='Enter') verifyAdminToken()">
      </div>
      <button class="primary-btn" onclick="verifyAdminToken()">Unlock Terminal</button>
      <div id="auth-error" style="color: var(--danger-color); font-size: 0.85rem; margin-top: 1rem; display: none;"></div>
    </div>
  </div>

  <div class="container" id="main-content" style="display: none;">
    <!-- Header -->
    <header>
      <div class="logo-container">
        <div class="logo-icon">👾</div>
        <div>
          <h1 class="brand-name">Cybermon</h1>
          <p class="brand-subtitle">Control Panel</p>
        </div>
      </div>
      <button class="logout-btn" onclick="logout()">Lock Dashboard</button>
    </header>

    <!-- Stats Panel -->
    <div class="stats-grid">
      <div class="stat-card glass-panel">
        <div class="stat-label">Total Users</div>
        <div class="stat-value" id="stat-total-users">0</div>
      </div>
      <div class="stat-card glass-panel banned">
        <div class="stat-label">Banned Users</div>
        <div class="stat-value" id="stat-banned-users" style="color: var(--danger-color);">0</div>
      </div>
      <div class="stat-card glass-panel">
        <div class="stat-label">Total Pokémon</div>
        <div class="stat-value" id="stat-total-pokemon">0</div>
      </div>
      <div class="stat-card glass-panel">
        <div class="stat-label">Total Coins</div>
        <div class="stat-value" id="stat-total-balance" style="color: #fbbf24;">0</div>
      </div>
    </div>

    <!-- Users Table Panel -->
    <div class="dashboard-panel glass-panel">
      <div class="panel-header">
        <h2 class="panel-title">User Monitoring</h2>
        <div class="search-wrapper">
          <span class="search-icon">🔍</span>
          <input type="text" id="user-search" class="search-input" placeholder="Search by ID or Username..." oninput="filterUsers()">
        </div>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Status</th>
              <th>Pokémon</th>
              <th>Balance</th>
              <th>Ban Reason</th>
              <th style="text-align: right;">Action</th>
            </tr>
          </thead>
          <tbody id="users-table-body">
            <tr>
              <td colspan="6" style="text-align: center; padding: 3rem;">
                <div class="loader"></div>
                <div style="margin-top: 1rem; color: var(--text-muted);">Fetching users from system db...</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Ban Dialog Modal -->
  <div class="modal-overlay" id="ban-modal">
    <div class="modal-card glass-panel">
      <div class="modal-header">
        <h3 class="panel-title" style="color: var(--danger-color);" id="modal-title">Ban User</h3>
        <span class="modal-close" onclick="closeBanModal()">&times;</span>
      </div>
      <div class="input-group">
        <label class="input-label" id="modal-user-label">User: Username (ID)</label>
      </div>
      <div class="input-group">
        <label class="input-label">Reason for Ban</label>
        <textarea id="ban-reason-input" class="styled-input" rows="4" style="resize: none;" placeholder="e.g. Exploiting bugs, spamming, alt farming..."></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn btn-cancel" onclick="closeBanModal()">Cancel</button>
        <button class="btn" style="background: var(--danger-color); color: white; border: none; padding: 0.5rem 1.5rem;" onclick="submitBan()">Apply Ban</button>
      </div>
    </div>
  </div>

  <!-- Toast Toast Notification -->
  <div class="toast" id="toast-notify">Success!</div>

  <script>
    let allUsers = [];
    let activeBanUserId = null;

    // Check if token exists in storage
    document.addEventListener("DOMContentLoaded", () => {
      const savedToken = localStorage.getItem("cybermon_admin_token");
      if (savedToken) {
        document.getElementById("auth-token-input").value = savedToken;
        verifyAdminToken();
      }
    });

    async function verifyAdminToken() {
      const token = document.getElementById("auth-token-input").value.trim();
      const errorDiv = document.getElementById("auth-error");
      
      if (!token) {
        errorDiv.textContent = "Please enter a token.";
        errorDiv.style.display = "block";
        return;
      }

      try {
        const res = await fetch("/api/admin/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token })
        });
        const data = await res.json();

        if (data.success) {
          localStorage.setItem("cybermon_admin_token", token);
          document.getElementById("auth-overlay").style.opacity = "0";
          setTimeout(() => {
            document.getElementById("auth-overlay").style.display = "none";
            document.getElementById("main-content").style.display = "block";
            loadDashboard();
          }, 300);
        } else {
          errorDiv.textContent = "Invalid token authorization code.";
          errorDiv.style.display = "block";
          localStorage.removeItem("cybermon_admin_token");
        }
      } catch (err) {
        errorDiv.textContent = "Connection to administration API failed.";
        errorDiv.style.display = "block";
      }
    }

    function logout() {
      localStorage.removeItem("cybermon_admin_token");
      document.getElementById("auth-token-input").value = "";
      document.getElementById("auth-overlay").style.display = "flex";
      setTimeout(() => {
        document.getElementById("auth-overlay").style.opacity = "1";
        document.getElementById("main-content").style.display = "none";
      }, 50);
    }

    async function loadDashboard() {
      const token = localStorage.getItem("cybermon_admin_token");
      try {
        const res = await fetch("/api/admin/users", {
          headers: { "Authorization": "Bearer " + token }
        });
        
        if (res.status === 401) {
          logout();
          return;
        }

        const data = await res.json();
        if (data.success) {
          allUsers = data.users;
          renderStats(data.stats);
          renderUsersTable(allUsers);
        } else {
          showToast(data.message || "Failed to load dashboard data.", "error");
        }
      } catch (err) {
        showToast("Error connecting to server database API.", "error");
      }
    }

    function renderStats(stats) {
      document.getElementById("stat-total-users").textContent = stats.totalUsers.toLocaleString();
      document.getElementById("stat-banned-users").textContent = stats.bannedUsers.toLocaleString();
      document.getElementById("stat-total-pokemon").textContent = stats.totalPokemon.toLocaleString();
      document.getElementById("stat-total-balance").textContent = stats.totalBalance.toLocaleString();
    }

    function renderUsersTable(users) {
      const tbody = document.getElementById("users-table-body");
      tbody.innerHTML = "";

      if (users.length === 0) {
        tbody.innerHTML = \`<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 3rem;">No users found matching query.</td></tr>\`;
        return;
      }

      users.forEach(user => {
        const tr = document.createElement("tr");

        // User cell
        const userCell = document.createElement("td");
        userCell.innerHTML = \`
          <div class="user-info">
            <img class="user-avatar" src="\${user.avatarUrl}" alt="Avatar">
            <div class="user-details">
              <span class="user-name">\${escapeHtml(user.username)}</span>
              <span class="user-id" onclick="navigator.clipboard.writeText('\${user.userId}'); showToast('User ID copied to clipboard!', 'success');" title="Click to copy ID">\${user.userId}</span>
            </div>
          </div>
        \`;
        tr.appendChild(userCell);

        // Status badge cell
        const statusCell = document.createElement("td");
        const badge = document.createElement("span");
        badge.className = user.banned ? "badge badge-danger" : "badge badge-success";
        badge.textContent = user.banned ? "Banned" : "Active";
        statusCell.appendChild(badge);
        tr.appendChild(statusCell);

        // Pokemon count
        const pkmnCell = document.createElement("td");
        pkmnCell.textContent = user.pokemonCount.toLocaleString();
        tr.appendChild(pkmnCell);

        // Balance
        const balCell = document.createElement("td");
        balCell.innerHTML = \`<span style="color: #fbbf24; font-weight: 500;">🪙 \${user.balance.toLocaleString()}</span>\`;
        tr.appendChild(balCell);

        // Ban reason
        const reasonCell = document.createElement("td");
        reasonCell.className = "ban-reason-text";
        reasonCell.textContent = user.banReason ? user.banReason : "—";
        reasonCell.title = user.banReason || "";
        tr.appendChild(reasonCell);

        // Actions
        const actionsCell = document.createElement("td");
        actionsCell.style.textAlign = "right";
        const actBtn = document.createElement("button");
        if (user.banned) {
          actBtn.className = "btn btn-action-unban";
          actBtn.textContent = "Unban";
          actBtn.onclick = () => performUnban(user.userId);
        } else {
          actBtn.className = "btn btn-action-ban";
          actBtn.textContent = "Ban User";
          actBtn.onclick = () => openBanModal(user.userId, user.username);
        }
        actionsCell.appendChild(actBtn);
        tr.appendChild(actionsCell);

        tbody.appendChild(tr);
      });
    }

    function filterUsers() {
      const q = document.getElementById("user-search").value.toLowerCase().trim();
      if (!q) {
        renderUsersTable(allUsers);
        return;
      }
      const filtered = allUsers.filter(u => 
        u.userId.includes(q) || 
        u.username.toLowerCase().includes(q) ||
        (u.banReason && u.banReason.toLowerCase().includes(q))
      );
      renderUsersTable(filtered);
    }

    function openBanModal(userId, username) {
      activeBanUserId = userId;
      document.getElementById("modal-user-label").textContent = \`User: \${username} (\${userId})\`;
      document.getElementById("ban-reason-input").value = "";
      document.getElementById("ban-modal").classList.add("active");
      document.getElementById("ban-reason-input").focus();
    }

    function closeBanModal() {
      document.getElementById("ban-modal").classList.remove("active");
      activeBanUserId = null;
    }

    async function submitBan() {
      const token = localStorage.getItem("cybermon_admin_token");
      const reason = document.getElementById("ban-reason-input").value.trim();
      
      if (!activeBanUserId) return;

      try {
        const res = await fetch("/api/admin/ban", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
          },
          body: JSON.stringify({
            userId: activeBanUserId,
            action: "ban",
            reason: reason || "Violating bot terms of service."
          })
        });

        const data = await res.json();
        if (data.success) {
          showToast(data.message, "success");
          closeBanModal();
          loadDashboard();
        } else {
          showToast(data.message || "Failed to execute ban.", "error");
        }
      } catch (err) {
        showToast("Error sending request to database api.", "error");
      }
    }

    async function performUnban(userId) {
      const token = localStorage.getItem("cybermon_admin_token");
      if (!confirm("Are you sure you want to unban this user?")) return;

      try {
        const res = await fetch("/api/admin/ban", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
          },
          body: JSON.stringify({
            userId,
            action: "unban"
          })
        });

        const data = await res.json();
        if (data.success) {
          showToast(data.message, "success");
          loadDashboard();
        } else {
          showToast(data.message || "Failed to lift ban.", "error");
        }
      } catch (err) {
        showToast("Error sending unban request to API.", "error");
      }
    }

    function showToast(msg, type = "success") {
      const toast = document.getElementById("toast-notify");
      toast.textContent = msg;
      toast.className = "toast";
      toast.classList.add(type === "success" ? "toast-success" : "toast-error");
      toast.classList.add("active");
      
      setTimeout(() => {
        toast.classList.remove("active");
      }, 3500);
    }

    function escapeHtml(str) {
      if (!str) return "";
      return str.replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
    }
  </script>
</body>
</html>`;
}

module.exports = { handleAdminRequest };
