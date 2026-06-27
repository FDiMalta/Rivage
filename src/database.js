const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

// En local : ./data/bdl.sqlite
// Sur Railway : mettre DATABASE_PATH=/data/bdl.sqlite avec un volume monté sur /data
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "data", "bdl.sqlite");

// Crée automatiquement le dossier parent si besoin
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

/* =========================
   TABLES
========================= */

// Table des points : chaque ligne représente un gain ou un retrait de points.
db.exec(`
  CREATE TABLE IF NOT EXISTS points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    is_secret INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Table des rumeurs : stocke les rumeurs proposées, approuvées ou refusées.
db.exec(`
  CREATE TABLE IF NOT EXISTS rumors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    content TEXT NOT NULL,
    target_user_id TEXT,
    anonymous INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by TEXT,
    review_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TEXT
  );
`);

// Table des paramètres : stocke les salons et rôles configurés avec /config.
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    UNIQUE(guild_id, key)
  );
`);

// Table des quêtes : stocke les quêtes hebdomadaires créées par le staff.
db.exec(`
  CREATE TABLE IF NOT EXISTS quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    reward_points INTEGER NOT NULL DEFAULT 1,
    reward_role_id TEXT,
    reward_role_days INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ends_at TEXT
  );
`);

// Migration de sécurité : si la base existait avant l’ajout de reward_role_days,
// on ajoute la colonne sans supprimer les anciennes données.
try {
  db.exec(`ALTER TABLE quests ADD COLUMN reward_role_days INTEGER;`);
} catch (error) {
  // La colonne existe déjà, donc on ignore.
}

// Migrations de sécurité pour les preuves enrichies des quêtes.
try {
  db.exec(`ALTER TABLE quest_submissions ADD COLUMN proof_image_url TEXT;`);
} catch (error) {
  // La colonne existe déjà, donc on ignore.
}

try {
  db.exec(`ALTER TABLE quest_submissions ADD COLUMN mentioned_user_id TEXT;`);
} catch (error) {
  // La colonne existe déjà, donc on ignore.
}

try {
  db.exec(`ALTER TABLE quest_submissions ADD COLUMN proof_link TEXT;`);
} catch (error) {
  // La colonne existe déjà, donc on ignore.
}

// Table des validations de quêtes : stocke les demandes de validation envoyées par les membres.
db.exec(`
  CREATE TABLE IF NOT EXISTS quest_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    quest_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    proof TEXT NOT NULL,
    proof_image_url TEXT,
    mentioned_user_id TEXT,
    proof_link TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by TEXT,
    review_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TEXT,
    UNIQUE(guild_id, quest_id, user_id)
  );
`);

// Table des rôles temporaires : permet de savoir quel rôle retirer et quand.
db.exec(`
  CREATE TABLE IF NOT EXISTS temporary_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    reason TEXT,
    expires_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    removed_at TEXT
  );
`);

// Table des parties Membre Mystère : une ligne = une semaine/partie.
db.exec(`
  CREATE TABLE IF NOT EXISTS mystery_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    target_user_id TEXT NOT NULL,
    week_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    winner_user_id TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revealed_at TEXT
  );
`);

// Table des indices du Membre Mystère.
db.exec(`
  CREATE TABLE IF NOT EXISTS mystery_hints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    game_id INTEGER NOT NULL,
    hint_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    published INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TEXT,
    UNIQUE(guild_id, game_id, hint_number)
  );
`);

// Table des propositions faites par les membres pour le Membre Mystère.
db.exec(`
  CREATE TABLE IF NOT EXISTS mystery_guesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    game_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    guessed_user_id TEXT NOT NULL,
    is_correct INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

// Table des Drop Events lancés par le staff.
db.exec(`
  CREATE TABLE IF NOT EXISTS drop_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    title TEXT NOT NULL,
    reward_points INTEGER NOT NULL DEFAULT 1,
    max_winners INTEGER NOT NULL DEFAULT 5,
    status TEXT NOT NULL DEFAULT 'active',
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TEXT
  );
`);

// Table des participants aux Drop Events.
db.exec(`
  CREATE TABLE IF NOT EXISTS drop_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    drop_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(guild_id, drop_id, user_id)
  );
`);

// Table des demandes d'achat de la boutique de points.
db.exec(`
  CREATE TABLE IF NOT EXISTS shop_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    item_key TEXT NOT NULL,
    item_name TEXT NOT NULL,
    price INTEGER NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by TEXT,
    review_reason TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TEXT
  );
`);

/* =========================
   POINTS
========================= */

// Ajoute une entrée de points pour un membre.
// amount peut être positif ou négatif.
function addPoints({ guildId, userId, amount, reason, isSecret = false, createdBy }) {
  const statement = db.prepare(`
    INSERT INTO points (
      guild_id,
      user_id,
      amount,
      reason,
      is_secret,
      created_by
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  statement.run(
    guildId,
    userId,
    amount,
    reason,
    isSecret ? 1 : 0,
    createdBy
  );
}

// Calcule le total des points d’un membre.
// includeSecret permet d’inclure ou non les points secrets.
function getUserTotalPoints({ guildId, userId, includeSecret = false }) {
  const statement = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM points
    WHERE guild_id = ?
      AND user_id = ?
      ${includeSecret ? "" : "AND is_secret = 0"}
  `);

  const row = statement.get(guildId, userId);
  return row.total;
}

// Retourne le classement global des membres par total de points.
function getLeaderboard({ guildId, includeSecret = false, limit = 10 }) {
  const statement = db.prepare(`
    SELECT user_id, COALESCE(SUM(amount), 0) AS total
    FROM points
    WHERE guild_id = ?
      ${includeSecret ? "" : "AND is_secret = 0"}
    GROUP BY user_id
    ORDER BY total DESC
    LIMIT ?
  `);

  return statement.all(guildId, limit);
}

// Retourne le classement d’un mois précis, utilisé pour Grand Maître.
function getMonthlyLeaderboard({ guildId, year, month, includeSecret = true, limit = 10 }) {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01T00:00:00.000Z`;

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextMonthYear = month === 12 ? year + 1 : year;

  const endDate = `${nextMonthYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00.000Z`;

  const statement = db.prepare(`
    SELECT user_id, COALESCE(SUM(amount), 0) AS total
    FROM points
    WHERE guild_id = ?
      AND created_at >= ?
      AND created_at < ?
      ${includeSecret ? "" : "AND is_secret = 0"}
    GROUP BY user_id
    ORDER BY total DESC
    LIMIT ?
  `);

  return statement.all(guildId, startDate, endDate, limit);
}

// Retourne les dernières entrées de points d’un membre.
function getUserPointsHistory({ guildId, userId, includeSecret = false, limit = 15 }) {
  const statement = db.prepare(`
    SELECT *
    FROM points
    WHERE guild_id = ?
      AND user_id = ?
      ${includeSecret ? "" : "AND is_secret = 0"}
    ORDER BY created_at DESC
    LIMIT ?
  `);

  return statement.all(guildId, userId, limit);
}

// Calcule le rang d’un membre dans le classement.
function getUserRank({ guildId, userId, includeSecret = false }) {
  const leaderboard = getLeaderboard({
    guildId,
    includeSecret,
    limit: 1000
  });

  const index = leaderboard.findIndex(row => row.user_id === userId);

  if (index === -1) {
    return null;
  }

  return {
    user_id: userId,
    total: leaderboard[index].total,
    rank: index + 1
  };
}

/* =========================
   RUMEURS
========================= */

// Enregistre une nouvelle rumeur proposée par un membre.
function addRumor({ guildId, authorId, content, targetUserId = null, anonymous = false }) {
  const statement = db.prepare(`
    INSERT INTO rumors (
      guild_id,
      author_id,
      content,
      target_user_id,
      anonymous,
      status
    )
    VALUES (?, ?, ?, ?, ?, 'pending')
  `);

  const result = statement.run(
    guildId,
    authorId,
    content,
    targetUserId,
    anonymous ? 1 : 0
  );

  return result.lastInsertRowid;
}

// Liste les rumeurs selon leur statut : pending, approved ou rejected.
function getRumorsByStatus({ guildId, status = "pending", limit = 10 }) {
  const statement = db.prepare(`
    SELECT *
    FROM rumors
    WHERE guild_id = ?
      AND status = ?
    ORDER BY created_at ASC
    LIMIT ?
  `);

  return statement.all(guildId, status, limit);
}

// Change le statut d’une rumeur après validation/refus du staff.
function updateRumorStatus({ guildId, rumorId, status, reviewedBy, reviewReason = null }) {
  const statement = db.prepare(`
    UPDATE rumors
    SET status = ?,
        reviewed_by = ?,
        review_reason = ?,
        reviewed_at = CURRENT_TIMESTAMP
    WHERE guild_id = ?
      AND id = ?
  `);

  const result = statement.run(
    status,
    reviewedBy,
    reviewReason,
    guildId,
    rumorId
  );

  return result.changes;
}

// Récupère une rumeur précise grâce à son ID.
function getRumorById({ guildId, rumorId }) {
  const statement = db.prepare(`
    SELECT *
    FROM rumors
    WHERE guild_id = ?
      AND id = ?
  `);

  return statement.get(guildId, rumorId);
}

// Compte les rumeurs approuvées proposées par un membre.
function getUserApprovedRumorCount({ guildId, userId }) {
  const statement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM rumors
    WHERE guild_id = ?
      AND author_id = ?
      AND status = 'approved'
  `);

  const row = statement.get(guildId, userId);
  return row.total;
}

/* =========================
   CONFIGURATION
========================= */

// Enregistre ou met à jour un paramètre de serveur.
function setSetting({ guildId, key, value }) {
  const statement = db.prepare(`
    INSERT INTO settings (
      guild_id,
      key,
      value
    )
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id, key)
    DO UPDATE SET value = excluded.value
  `);

  statement.run(guildId, key, value);
}

// Récupère un paramètre précis du serveur.
function getSetting({ guildId, key }) {
  const statement = db.prepare(`
    SELECT value
    FROM settings
    WHERE guild_id = ?
      AND key = ?
  `);

  const row = statement.get(guildId, key);
  return row ? row.value : null;
}

// Récupère toute la configuration enregistrée pour un serveur.
function getAllSettings({ guildId }) {
  const statement = db.prepare(`
    SELECT key, value
    FROM settings
    WHERE guild_id = ?
    ORDER BY key ASC
  `);

  return statement.all(guildId);
}

/* =========================
   QUÊTES
========================= */

// Crée une nouvelle quête hebdomadaire.
function addQuest({
  guildId,
  title,
  description,
  rewardPoints = 1,
  rewardRoleId = null,
  rewardRoleDays = null,
  createdBy,
  endsAt = null
}) {
  const statement = db.prepare(`
    INSERT INTO quests (
      guild_id,
      title,
      description,
      reward_points,
      reward_role_id,
      reward_role_days,
      created_by,
      ends_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = statement.run(
    guildId,
    title,
    description,
    rewardPoints,
    rewardRoleId,
    rewardRoleDays,
    createdBy,
    endsAt
  );

  return result.lastInsertRowid;
}

// Liste les quêtes actuellement actives.
function getActiveQuests({ guildId, limit = 10 }) {
  const statement = db.prepare(`
    SELECT *
    FROM quests
    WHERE guild_id = ?
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT ?
  `);

  return statement.all(guildId, limit);
}

// Récupère une quête précise grâce à son ID.
function getQuestById({ guildId, questId }) {
  const statement = db.prepare(`
    SELECT *
    FROM quests
    WHERE guild_id = ?
      AND id = ?
  `);

  return statement.get(guildId, questId);
}

// Enregistre une demande de validation de quête envoyée par un membre.
// proofImageUrl, mentionedUserId et proofLink permettent au staff de vérifier plus facilement.
function addQuestSubmission({
  guildId,
  questId,
  userId,
  proof,
  proofImageUrl = null,
  mentionedUserId = null,
  proofLink = null
}) {
  const statement = db.prepare(`
    INSERT INTO quest_submissions (
      guild_id,
      quest_id,
      user_id,
      proof,
      proof_image_url,
      mentioned_user_id,
      proof_link,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
  `);

  const result = statement.run(
    guildId,
    questId,
    userId,
    proof,
    proofImageUrl,
    mentionedUserId,
    proofLink
  );

  return result.lastInsertRowid;
}

// Liste les validations de quêtes selon leur statut.
function getQuestSubmissionsByStatus({ guildId, status = "pending", limit = 10 }) {
  const statement = db.prepare(`
    SELECT
      quest_submissions.*,
      quests.title AS quest_title,
      quests.reward_points AS reward_points,
      quests.reward_role_id AS reward_role_id,
      quests.reward_role_days AS reward_role_days
    FROM quest_submissions
    JOIN quests ON quests.id = quest_submissions.quest_id
    WHERE quest_submissions.guild_id = ?
      AND quest_submissions.status = ?
    ORDER BY quest_submissions.created_at ASC
    LIMIT ?
  `);

  return statement.all(guildId, status, limit);
}

// Récupère une validation de quête précise avec les infos de la quête liée.
function getQuestSubmissionById({ guildId, submissionId }) {
  const statement = db.prepare(`
    SELECT
      quest_submissions.*,
      quests.title AS quest_title,
      quests.reward_points AS reward_points,
      quests.reward_role_id AS reward_role_id,
      quests.reward_role_days AS reward_role_days
    FROM quest_submissions
    JOIN quests ON quests.id = quest_submissions.quest_id
    WHERE quest_submissions.guild_id = ?
      AND quest_submissions.id = ?
  `);

  return statement.get(guildId, submissionId);
}

// Change le statut d’une validation de quête.
function updateQuestSubmissionStatus({
  guildId,
  submissionId,
  status,
  reviewedBy,
  reviewReason = null
}) {
  const statement = db.prepare(`
    UPDATE quest_submissions
    SET status = ?,
        reviewed_by = ?,
        review_reason = ?,
        reviewed_at = CURRENT_TIMESTAMP
    WHERE guild_id = ?
      AND id = ?
  `);

  const result = statement.run(
    status,
    reviewedBy,
    reviewReason,
    guildId,
    submissionId
  );

  return result.changes;
}

// Ferme une quête pour qu’elle ne soit plus active.
function closeQuest({ guildId, questId }) {
  const statement = db.prepare(`
    UPDATE quests
    SET status = 'closed'
    WHERE guild_id = ?
      AND id = ?
  `);

  const result = statement.run(guildId, questId);
  return result.changes;
}

// Compte les quêtes validées par un membre.
function getUserApprovedQuestCount({ guildId, userId }) {
  const statement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM quest_submissions
    WHERE guild_id = ?
      AND user_id = ?
      AND status = 'approved'
  `);

  const row = statement.get(guildId, userId);
  return row.total;
}

/* =========================
   RÔLES TEMPORAIRES
========================= */

// Enregistre un rôle temporaire donné à un membre.
function addTemporaryRole({
  guildId,
  userId,
  roleId,
  reason = null,
  expiresAt,
  createdBy
}) {
  const statement = db.prepare(`
    INSERT INTO temporary_roles (
      guild_id,
      user_id,
      role_id,
      reason,
      expires_at,
      created_by
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result = statement.run(
    guildId,
    userId,
    roleId,
    reason,
    expiresAt,
    createdBy
  );

  return result.lastInsertRowid;
}

// Liste les rôles temporaires expirés qui doivent être retirés.
function getExpiredTemporaryRoles({ now }) {
  const statement = db.prepare(`
    SELECT *
    FROM temporary_roles
    WHERE removed_at IS NULL
      AND expires_at <= ?
  `);

  return statement.all(now);
}

// Marque un rôle temporaire comme déjà retiré.
function markTemporaryRoleRemoved({ id }) {
  const statement = db.prepare(`
    UPDATE temporary_roles
    SET removed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  return statement.run(id).changes;
}

// Liste tous les rôles temporaires actifs du serveur.
function getActiveTemporaryRoles({ guildId, limit = 20 }) {
  const statement = db.prepare(`
    SELECT *
    FROM temporary_roles
    WHERE guild_id = ?
      AND removed_at IS NULL
    ORDER BY expires_at ASC
    LIMIT ?
  `);

  return statement.all(guildId, limit);
}

// Liste les rôles temporaires actifs d’un membre précis.
function getUserActiveTemporaryRoles({ guildId, userId, limit = 10 }) {
  const statement = db.prepare(`
    SELECT *
    FROM temporary_roles
    WHERE guild_id = ?
      AND user_id = ?
      AND removed_at IS NULL
    ORDER BY expires_at ASC
    LIMIT ?
  `);

  return statement.all(guildId, userId, limit);
}

/* =========================
   MEMBRE MYSTÈRE
========================= */

// Crée une nouvelle partie Membre Mystère.
// Ferme automatiquement l’ancienne partie active si elle existe.
function createMysteryGame({ guildId, targetUserId, weekKey, createdBy }) {
  const closeOldGames = db.prepare(`
    UPDATE mystery_games
    SET status = 'closed'
    WHERE guild_id = ?
      AND status = 'active'
  `);

  closeOldGames.run(guildId);

  const statement = db.prepare(`
    INSERT INTO mystery_games (
      guild_id,
      target_user_id,
      week_key,
      created_by
    )
    VALUES (?, ?, ?, ?)
  `);

  const result = statement.run(
    guildId,
    targetUserId,
    weekKey,
    createdBy
  );

  return result.lastInsertRowid;
}

// Récupère la partie Membre Mystère actuellement active.
function getActiveMysteryGame({ guildId }) {
  const statement = db.prepare(`
    SELECT *
    FROM mystery_games
    WHERE guild_id = ?
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1
  `);

  return statement.get(guildId);
}

// Ajoute ou remplace un indice pour la partie Membre Mystère.
function addMysteryHint({ guildId, gameId, hintNumber, content }) {
  const statement = db.prepare(`
    INSERT INTO mystery_hints (
      guild_id,
      game_id,
      hint_number,
      content
    )
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, game_id, hint_number)
    DO UPDATE SET content = excluded.content
  `);

  statement.run(guildId, gameId, hintNumber, content);
}

// Liste tous les indices d’une partie Membre Mystère.
function getMysteryHints({ guildId, gameId }) {
  const statement = db.prepare(`
    SELECT *
    FROM mystery_hints
    WHERE guild_id = ?
      AND game_id = ?
    ORDER BY hint_number ASC
  `);

  return statement.all(guildId, gameId);
}

// Marque un indice comme publié.
function markMysteryHintPublished({ guildId, gameId, hintNumber }) {
  const statement = db.prepare(`
    UPDATE mystery_hints
    SET published = 1,
        published_at = CURRENT_TIMESTAMP
    WHERE guild_id = ?
      AND game_id = ?
      AND hint_number = ?
  `);

  return statement.run(guildId, gameId, hintNumber).changes;
}

// Récupère un indice précis par son numéro.
function getMysteryHintByNumber({ guildId, gameId, hintNumber }) {
  const statement = db.prepare(`
    SELECT *
    FROM mystery_hints
    WHERE guild_id = ?
      AND game_id = ?
      AND hint_number = ?
  `);

  return statement.get(guildId, gameId, hintNumber);
}

// Enregistre une proposition de membre mystère.
function addMysteryGuess({ guildId, gameId, userId, guessedUserId, isCorrect }) {
  const statement = db.prepare(`
    INSERT INTO mystery_guesses (
      guild_id,
      game_id,
      user_id,
      guessed_user_id,
      is_correct
    )
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = statement.run(
    guildId,
    gameId,
    userId,
    guessedUserId,
    isCorrect ? 1 : 0
  );

  return result.lastInsertRowid;
}

// Récupère la première bonne réponse d’une partie.
function getFirstCorrectMysteryGuess({ guildId, gameId }) {
  const statement = db.prepare(`
    SELECT *
    FROM mystery_guesses
    WHERE guild_id = ?
      AND game_id = ?
      AND is_correct = 1
    ORDER BY created_at ASC
    LIMIT 1
  `);

  return statement.get(guildId, gameId);
}

// Vérifie si un membre a déjà fait une proposition aujourd’hui pour la partie active.
function hasMysteryGuessToday({ guildId, gameId, userId }) {
  const statement = db.prepare(`
    SELECT id
    FROM mystery_guesses
    WHERE guild_id = ?
      AND game_id = ?
      AND user_id = ?
      AND DATE(created_at) = DATE('now')
    LIMIT 1
  `);

  return Boolean(statement.get(guildId, gameId, userId));
}

// Récupère les premiers membres différents qui ont trouvé le Membre Mystère.
function getTopCorrectMysteryGuessers({ guildId, gameId, limit = 3 }) {
  const statement = db.prepare(`
    SELECT
      user_id,
      MIN(created_at) AS first_correct_at
    FROM mystery_guesses
    WHERE guild_id = ?
      AND game_id = ?
      AND is_correct = 1
    GROUP BY user_id
    ORDER BY first_correct_at ASC
    LIMIT ?
  `);

  return statement.all(guildId, gameId, limit);
}

// Révèle officiellement le Membre Mystère et ferme la partie.
function revealMysteryGame({ guildId, gameId, winnerUserId = null }) {
  const statement = db.prepare(`
    UPDATE mystery_games
    SET status = 'revealed',
        winner_user_id = ?,
        revealed_at = CURRENT_TIMESTAMP
    WHERE guild_id = ?
      AND id = ?
  `);

  return statement.run(winnerUserId, guildId, gameId).changes;
}

/* =========================
   DROP EVENTS
========================= */

// Crée un nouveau Drop Event.
function createDropEvent({
  guildId,
  channelId,
  title,
  rewardPoints = 1,
  maxWinners = 5,
  createdBy
}) {
  const statement = db.prepare(`
    INSERT INTO drop_events (
      guild_id,
      channel_id,
      title,
      reward_points,
      max_winners,
      created_by
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result = statement.run(
    guildId,
    channelId,
    title,
    rewardPoints,
    maxWinners,
    createdBy
  );

  return result.lastInsertRowid;
}

// Enregistre l’ID du message Discord lié au Drop Event.
function setDropMessageId({ guildId, dropId, messageId }) {
  const statement = db.prepare(`
    UPDATE drop_events
    SET message_id = ?
    WHERE guild_id = ?
      AND id = ?
  `);

  return statement.run(messageId, guildId, dropId).changes;
}

// Récupère un Drop Event précis par son ID.
function getDropEventById({ guildId, dropId }) {
  const statement = db.prepare(`
    SELECT *
    FROM drop_events
    WHERE guild_id = ?
      AND id = ?
  `);

  return statement.get(guildId, dropId);
}

// Ajoute un participant à un Drop Event.
// La contrainte UNIQUE empêche un membre de participer deux fois.
function addDropParticipant({ guildId, dropId, userId }) {
  const statement = db.prepare(`
    INSERT INTO drop_participants (
      guild_id,
      drop_id,
      user_id
    )
    VALUES (?, ?, ?)
  `);

  const result = statement.run(guildId, dropId, userId);
  return result.lastInsertRowid;
}

// Liste les participants d’un Drop Event dans l’ordre d’arrivée.
function getDropParticipants({ guildId, dropId }) {
  const statement = db.prepare(`
    SELECT *
    FROM drop_participants
    WHERE guild_id = ?
      AND drop_id = ?
    ORDER BY created_at ASC
  `);

  return statement.all(guildId, dropId);
}

// Termine un Drop Event.
function endDropEvent({ guildId, dropId }) {
  const statement = db.prepare(`
    UPDATE drop_events
    SET status = 'ended',
        ended_at = CURRENT_TIMESTAMP
    WHERE guild_id = ?
      AND id = ?
  `);

  return statement.run(guildId, dropId).changes;
}


/* =========================
   BOUTIQUE DE POINTS
========================= */

// Enregistre une demande d'achat dans la boutique.
function addShopPurchase({ guildId, userId, itemKey, itemName, price, note = null }) {
  const statement = db.prepare(`
    INSERT INTO shop_purchases (
      guild_id,
      user_id,
      item_key,
      item_name,
      price,
      note,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `);

  const result = statement.run(guildId, userId, itemKey, itemName, price, note);
  return result.lastInsertRowid;
}

// Récupère une demande d'achat précise.
function getShopPurchaseById({ guildId, purchaseId }) {
  const statement = db.prepare(`
    SELECT *
    FROM shop_purchases
    WHERE guild_id = ?
      AND id = ?
  `);

  return statement.get(guildId, purchaseId);
}

// Liste les demandes d'achat selon leur statut.
function getShopPurchasesByStatus({ guildId, status = "pending", limit = 10 }) {
  const statement = db.prepare(`
    SELECT *
    FROM shop_purchases
    WHERE guild_id = ?
      AND status = ?
    ORDER BY created_at ASC
    LIMIT ?
  `);

  return statement.all(guildId, status, limit);
}

// Liste les dernières demandes d'achat d'un membre.
function getUserShopPurchases({ guildId, userId, limit = 5 }) {
  const statement = db.prepare(`
    SELECT *
    FROM shop_purchases
    WHERE guild_id = ?
      AND user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);

  return statement.all(guildId, userId, limit);
}

// Change le statut d'une demande d'achat.
function updateShopPurchaseStatus({ guildId, purchaseId, status, reviewedBy, reviewReason = null }) {
  const statement = db.prepare(`
    UPDATE shop_purchases
    SET status = ?,
        reviewed_by = ?,
        review_reason = ?,
        reviewed_at = CURRENT_TIMESTAMP
    WHERE guild_id = ?
      AND id = ?
  `);

  return statement.run(status, reviewedBy, reviewReason, guildId, purchaseId).changes;
}

/* =========================
   BACKUP / STATS
========================= */

// Compte les lignes d’une table autorisée.
function countTableRows(tableName) {
  const allowedTables = [
    "points",
    "rumors",
    "quests",
    "quest_submissions",
    "temporary_roles",
    "mystery_games",
    "mystery_hints",
    "mystery_guesses",
    "drop_events",
    "drop_participants",
    "shop_purchases",
    "settings"
  ];

  if (!allowedTables.includes(tableName)) {
    throw new Error(`Table non autorisée : ${tableName}`);
  }

  const statement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM ${tableName}
  `);

  const row = statement.get();
  return row.total;
}

// Regroupe les statistiques principales de la base pour /backup info.
function getBackupStats() {
  return {
    points: countTableRows("points"),
    rumors: countTableRows("rumors"),
    quests: countTableRows("quests"),
    questSubmissions: countTableRows("quest_submissions"),
    temporaryRoles: countTableRows("temporary_roles"),
    mysteryGames: countTableRows("mystery_games"),
    mysteryHints: countTableRows("mystery_hints"),
    mysteryGuesses: countTableRows("mystery_guesses"),
    dropEvents: countTableRows("drop_events"),
    dropParticipants: countTableRows("drop_participants"),
    shopPurchases: countTableRows("shop_purchases"),
    settings: countTableRows("settings")
  };
}

// Compte les rôles temporaires encore actifs.
function getActiveTemporaryRoleCount() {
  const statement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM temporary_roles
    WHERE removed_at IS NULL
  `);

  const row = statement.get();
  return row.total;
}

// Compte les rumeurs encore en attente.
function getPendingRumorCount() {
  const statement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM rumors
    WHERE status = 'pending'
  `);

  const row = statement.get();
  return row.total;
}

// Compte les validations de quêtes encore en attente.
function getPendingQuestSubmissionCount() {
  const statement = db.prepare(`
    SELECT COUNT(*) AS total
    FROM quest_submissions
    WHERE status = 'pending'
  `);

  const row = statement.get();
  return row.total;
}

/* =========================
   ARCHIVE / NETTOYAGE
========================= */

// Supprime les anciens Drop Events terminés et leurs participants.
function deleteOldDropEvents({ beforeDate }) {
  const deleteParticipants = db.prepare(`
    DELETE FROM drop_participants
    WHERE drop_id IN (
      SELECT id
      FROM drop_events
      WHERE status = 'ended'
        AND ended_at IS NOT NULL
        AND ended_at < ?
    )
  `);

  const deleteEvents = db.prepare(`
    DELETE FROM drop_events
    WHERE status = 'ended'
      AND ended_at IS NOT NULL
      AND ended_at < ?
  `);

  const participantsResult = deleteParticipants.run(beforeDate);
  const eventsResult = deleteEvents.run(beforeDate);

  return {
    events: eventsResult.changes,
    participants: participantsResult.changes
  };
}

// Supprime les anciennes rumeurs refusées.
function deleteOldRejectedRumors({ beforeDate }) {
  const statement = db.prepare(`
    DELETE FROM rumors
    WHERE status = 'rejected'
      AND reviewed_at IS NOT NULL
      AND reviewed_at < ?
  `);

  const result = statement.run(beforeDate);

  return {
    rumors: result.changes
  };
}

// Supprime les anciennes parties Membre Mystère terminées avec leurs indices/propositions.
function deleteOldMysteryGames({ beforeDate }) {
  const deleteGuesses = db.prepare(`
    DELETE FROM mystery_guesses
    WHERE game_id IN (
      SELECT id
      FROM mystery_games
      WHERE status IN ('revealed', 'closed')
        AND revealed_at IS NOT NULL
        AND revealed_at < ?
    )
  `);

  const deleteHints = db.prepare(`
    DELETE FROM mystery_hints
    WHERE game_id IN (
      SELECT id
      FROM mystery_games
      WHERE status IN ('revealed', 'closed')
        AND revealed_at IS NOT NULL
        AND revealed_at < ?
    )
  `);

  const deleteGames = db.prepare(`
    DELETE FROM mystery_games
    WHERE status IN ('revealed', 'closed')
      AND revealed_at IS NOT NULL
      AND revealed_at < ?
  `);

  const guessesResult = deleteGuesses.run(beforeDate);
  const hintsResult = deleteHints.run(beforeDate);
  const gamesResult = deleteGames.run(beforeDate);

  return {
    games: gamesResult.changes,
    hints: hintsResult.changes,
    guesses: guessesResult.changes
  };
}

// Supprime l’historique des rôles temporaires déjà retirés.
function deleteOldRemovedTemporaryRoles({ beforeDate }) {
  const statement = db.prepare(`
    DELETE FROM temporary_roles
    WHERE removed_at IS NOT NULL
      AND removed_at < ?
  `);

  const result = statement.run(beforeDate);

  return {
    temporaryRoles: result.changes
  };
}

// Optimise le fichier SQLite après suppression de données.
function vacuumDatabase() {
  db.exec("VACUUM;");
}

/* =========================
   EXPORTS
========================= */

// Exporte toutes les fonctions pour que index.js puisse les utiliser.
// Sans ces exports, les commandes Discord ne pourraient pas appeler la base.
module.exports = {
  addPoints,
  getUserTotalPoints,
  getLeaderboard,
  getMonthlyLeaderboard,
  getUserPointsHistory,
  getUserRank,

  addRumor,
  getRumorsByStatus,
  updateRumorStatus,
  getRumorById,
  getUserApprovedRumorCount,

  setSetting,
  getSetting,
  getAllSettings,

  addQuest,
  getActiveQuests,
  getQuestById,
  addQuestSubmission,
  getQuestSubmissionsByStatus,
  getQuestSubmissionById,
  updateQuestSubmissionStatus,
  closeQuest,
  getUserApprovedQuestCount,

  addTemporaryRole,
  getExpiredTemporaryRoles,
  markTemporaryRoleRemoved,
  getActiveTemporaryRoles,
  getUserActiveTemporaryRoles,

  createMysteryGame,
  getActiveMysteryGame,
  addMysteryHint,
  getMysteryHints,
  markMysteryHintPublished,
  getMysteryHintByNumber,
  addMysteryGuess,
  getFirstCorrectMysteryGuess,
  hasMysteryGuessToday,
  getTopCorrectMysteryGuessers,
  revealMysteryGame,

  createDropEvent,
  setDropMessageId,
  getDropEventById,
  addDropParticipant,
  getDropParticipants,
  endDropEvent,

  addShopPurchase,
  getShopPurchaseById,
  getShopPurchasesByStatus,
  getUserShopPurchases,
  updateShopPurchaseStatus,

  getBackupStats,
  getActiveTemporaryRoleCount,
  getPendingRumorCount,
  getPendingQuestSubmissionCount,

  deleteOldDropEvents,
  deleteOldRejectedRumors,
  deleteOldMysteryGames,
  deleteOldRemovedTemporaryRoles,
  vacuumDatabase
};