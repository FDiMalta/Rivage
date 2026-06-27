const NodeCache = require("node-cache");

// Créer une instance de cache avec une durée de vie par défaut de 5 minutes
const cache = new NodeCache({
  stdTTL: 300,       // 5 minutes en secondes
  checkperiod: 600,  // Vérifie les éléments expirés toutes les 10 minutes
  useClones: false   // Ne pas cloner les objets (meilleure performance)
});

// =============================================================================
// CLÉS DE CACHE
// =============================================================================

/**
 * Génère des clés de cache uniques pour éviter les collisions
 */
const CACHE_KEYS = {
  // Points
  USER_POINTS: (guildId, userId, includeSecret) => `points:${guildId}:${userId}:${includeSecret}`,
  LEADERBOARD: (guildId, includeSecret) => `leaderboard:${guildId}:${includeSecret}`,

  // Configuration
  SETTING: (guildId, key) => `setting:${guildId}:${key}`,
  STAFF_ROLE: (guildId) => `staff_role:${guildId}`,

  // Rumeurs
  RUMORS_BY_STATUS: (guildId, status) => `rumors:${guildId}:status:${status}`,
  USER_RUMORS_COUNT: (guildId, userId) => `rumors:${guildId}:user:${userId}:count`,

  // Quêtes
  ACTIVE_QUESTS: (guildId) => `quests:${guildId}:active`,
  QUEST_SUBMISSIONS: (guildId, status) => `quests:${guildId}:submissions:${status}`,
  USER_QUESTS_COUNT: (guildId, userId) => `quests:${guildId}:user:${userId}:count`,

  // Rôles temporaires
  ACTIVE_TEMP_ROLES: (guildId) => `temp_roles:${guildId}:active`,
  USER_TEMP_ROLES: (guildId, userId) => `temp_roles:${guildId}:user:${userId}`,

  // Membre Mystère
  ACTIVE_MYSTERY_GAME: (guildId) => `mystery:${guildId}:active`,
  MYSTERY_HINTS: (guildId, gameId) => `mystery:${guildId}:game:${gameId}:hints`,

  // Drop Events
  ACTIVE_DROP_EVENTS: (guildId) => `drops:${guildId}:active`,
  DROP_PARTICIPANTS: (guildId, dropId) => `drops:${guildId}:${dropId}:participants`,

  // Boutique
  SHOP_PURCHASES: (guildId, status) => `shop:${guildId}:purchases:${status}`,
  USER_SHOP_PURCHASES: (guildId, userId) => `shop:${guildId}:user:${userId}:purchases`
};

// =============================================================================
// INITIALISATION DU CACHE
// =============================================================================

/**
 * Initialise le cache avec la base de données
 * @param {object} dbModule - Module de la base de données
 */
function initCache(dbModule) {
  // On ne fait rien ici, le cache est déjà initialisé
  // Mais on pourrait pré-charger certaines données si nécessaire
  logger.info("Cache initialisé avec node-cache");
}

// =============================================================================
// FONCTIONS DE CACHE POUR LES POINTS
// =============================================================================

/**
 * Récupère les points d'un utilisateur (avec cache)
 * @param {object} options - Options de la requête
 * @param {string} options.guildId - ID de la guild
 * @param {string} options.userId - ID de l'utilisateur
 * @param {boolean} options.includeSecret - Inclure les points secrets
 * @returns {number} - Total des points
 */
function getCachedUserPoints({ guildId, userId, includeSecret = false }) {
  const key = CACHE_KEYS.USER_POINTS(guildId, userId, includeSecret);
  const cached = cache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const db = require("../../database");
  const total = db.getUserTotalPoints({ guildId, userId, includeSecret });

  cache.set(key, total);
  return total;
}

/**
 * Récupère le classement (avec cache)
 * @param {object} options - Options de la requête
 * @param {string} options.guildId - ID de la guild
 * @param {boolean} options.includeSecret - Inclure les points secrets
 * @param {number} options.limit - Nombre de résultats
 * @returns {Array} - Classement
 */
function getCachedLeaderboard({ guildId, includeSecret = false, limit = 10 }) {
  const key = CACHE_KEYS.LEADERBOARD(guildId, includeSecret);
  const cached = cache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const db = require("../../database");
  const leaderboard = db.getLeaderboard({ guildId, includeSecret, limit });

  cache.set(key, leaderboard);
  return leaderboard;
}

// =============================================================================
// FONCTIONS DE CACHE POUR LA CONFIGURATION
// =============================================================================

/**
 * Récupère un paramètre (avec cache)
 * @param {object} options - Options de la requête
 * @param {string} options.guildId - ID de la guild
 * @param {string} options.key - Clé du paramètre
 * @returns {string|null} - Valeur du paramètre
 */
function getCachedSetting({ guildId, key }) {
  const cacheKey = CACHE_KEYS.SETTING(guildId, key);
  const cached = cache.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const db = require("../../database");
  const value = db.getSetting({ guildId, key });

  if (value !== null) {
    cache.set(cacheKey, value);
  }

  return value;
}

// =============================================================================
// FONCTIONS DE CACHE POUR LES RÔLES STAFF
// =============================================================================

/**
 * Récupère l'ID du rôle staff (avec cache)
 * @param {string} guildId - ID de la guild
 * @returns {string|null} - ID du rôle staff
 */
function getCachedStaffRoleId(guildId) {
  const cacheKey = CACHE_KEYS.STAFF_ROLE(guildId);
  const cached = cache.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const db = require("../../database");
  const roleId = db.getSetting({ guildId, key: "staff_role_id" });

  if (roleId !== null) {
    cache.set(cacheKey, roleId);
  }

  return roleId;
}

// =============================================================================
// FONCTIONS DE CACHE POUR LES RUMEURS
// =============================================================================

/**
 * Récupère les rumeurs par statut (avec cache)
 * @param {object} options - Options de la requête
 * @param {string} options.guildId - ID de la guild
 * @param {string} options.status - Statut des rumeurs
 * @param {number} options.limit - Nombre de résultats
 * @returns {Array} - Liste des rumeurs
 */
function getCachedRumorsByStatus({ guildId, status = "pending", limit = 10 }) {
  const key = CACHE_KEYS.RUMORS_BY_STATUS(guildId, status);
  const cached = cache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const db = require("../../database");
  const rumors = db.getRumorsByStatus({ guildId, status, limit });

  cache.set(key, rumors);
  return rumors;
}

/**
 * Récupère le nombre de rumeurs approuvées d'un utilisateur (avec cache)
 * @param {object} options - Options de la requête
 * @param {string} options.guildId - ID de la guild
 * @param {string} options.userId - ID de l'utilisateur
 * @returns {number} - Nombre de rumeurs approuvées
 */
function getCachedUserApprovedRumorCount({ guildId, userId }) {
  const key = CACHE_KEYS.USER_RUMORS_COUNT(guildId, userId);
  const cached = cache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const db = require("../../database");
  const count = db.getUserApprovedRumorCount({ guildId, userId });

  cache.set(key, count);
  return count;
}

// =============================================================================
// FONCTIONS DE CACHE POUR LES QUÊTES
// =============================================================================

/**
 * Récupère les quêtes actives (avec cache)
 * @param {object} options - Options de la requête
 * @param {string} options.guildId - ID de la guild
 * @param {number} options.limit - Nombre de résultats
 * @returns {Array} - Liste des quêtes actives
 */
function getCachedActiveQuests({ guildId, limit = 10 }) {
  const key = CACHE_KEYS.ACTIVE_QUESTS(guildId);
  const cached = cache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const db = require("../../database");
  const quests = db.getActiveQuests({ guildId, limit });

  cache.set(key, quests);
  return quests;
}

/**
 * Récupère les validations de quêtes par statut (avec cache)
 * @param {object} options - Options de la requête
 * @param {string} options.guildId - ID de la guild
 * @param {string} options.status - Statut des validations
 * @param {number} options.limit - Nombre de résultats
 * @returns {Array} - Liste des validations
 */
function getCachedQuestSubmissionsByStatus({ guildId, status = "pending", limit = 10 }) {
  const key = CACHE_KEYS.QUEST_SUBMISSIONS(guildId, status);
  const cached = cache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const db = require("../../database");
  const submissions = db.getQuestSubmissionsByStatus({ guildId, status, limit });

  cache.set(key, submissions);
  return submissions;
}

/**
 * Récupère le nombre de quêtes validées d'un utilisateur (avec cache)
 * @param {object} options - Options de la requête
 * @param {string} options.guildId - ID de la guild
 * @param {string} options.userId - ID de l'utilisateur
 * @returns {number} - Nombre de quêtes validées
 */
function getCachedUserApprovedQuestCount({ guildId, userId }) {
  const key = CACHE_KEYS.USER_QUESTS_COUNT(guildId, userId);
  const cached = cache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const db = require("../../database");
  const count = db.getUserApprovedQuestCount({ guildId, userId });

  cache.set(key, count);
  return count;
}

// =============================================================================
// FONCTIONS DE CACHE POUR LES RÔLES TEMPORAIRES
// =============================================================================

/**
 * Récupère les rôles temporaires actifs (avec cache)
 * @param {object} options - Options de la requête
 * @param {string} options.guildId - ID de la guild
 * @param {number} options.limit - Nombre de résultats
 * @returns {Array} - Liste des rôles temporaires
 */
function getCachedActiveTemporaryRoles({ guildId, limit = 20 }) {
  const key = CACHE_KEYS.ACTIVE_TEMP_ROLES(guildId);
  const cached = cache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const db = require("../../database");
  const roles = db.getActiveTemporaryRoles({ guildId, limit });

  cache.set(key, roles);
  return roles;
}

/**
 * Récupère les rôles temporaires actifs d'un utilisateur (avec cache)
 * @param {object} options - Options de la requête
 * @param {string} options.guildId - ID de la guild
 * @param {string} options.userId - ID de l'utilisateur
 * @param {number} options.limit - Nombre de résultats
 * @returns {Array} - Liste des rôles temporaires
 */
function getCachedUserActiveTemporaryRoles({ guildId, userId, limit = 10 }) {
  const key = CACHE_KEYS.USER_TEMP_ROLES(guildId, userId);
  const cached = cache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const db = require("../../database");
  const roles = db.getUserActiveTemporaryRoles({ guildId, userId, limit });

  cache.set(key, roles);
  return roles;
}

// =============================================================================
// FONCTIONS DE CACHE POUR LE MEMBRE MYSTÈRE
// =============================================================================

/**
 * Récupère la partie Membre Mystère active (avec cache)
 * @param {object} options - Options de la requête
 * @param {string} options.guildId - ID de la guild
 * @returns {object|null} - Partie active
 */
function getCachedActiveMysteryGame({ guildId }) {
  const key = CACHE_KEYS.ACTIVE_MYSTERY_GAME(guildId);
  const cached = cache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const db = require("../../database");
  const game = db.getActiveMysteryGame({ guildId });

  if (game) {
    cache.set(key, game);
  }

  return game;
}

/**
 * Récupère les indices d'une partie Membre Mystère (avec cache)
 * @param {object} options - Options de la requête
 * @param {string} options.guildId - ID de la guild
 * @param {number} options.gameId - ID de la partie
 * @returns {Array} - Liste des indices
 */
function getCachedMysteryHints({ guildId, gameId }) {
  const key = CACHE_KEYS.MYSTERY_HINTS(guildId, gameId);
  const cached = cache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const db = require("../../database");
  const hints = db.getMysteryHints({ guildId, gameId });

  cache.set(key, hints);
  return hints;
}

// =============================================================================
// FONCTIONS DE CACHE POUR LES DROP EVENTS
// =============================================================================

/**
 * Récupère les Drop Events actifs (avec cache)
 * @param {object} options - Options de la requête
 * @param {string} options.guildId - ID de la guild
 * @returns {Array} - Liste des Drop Events
 */
function getCachedActiveDropEvents({ guildId }) {
  const key = CACHE_KEYS.ACTIVE_DROP_EVENTS(guildId);
  const cached = cache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const db = require("../../database");
  const events = db.getDropEventsByStatus({ guildId, status: "active" });

  cache.set(key, events);
  return events;
}

/**
 * Récupère les participants d'un Drop Event (avec cache)
 * @param {object} options - Options de la requête
 * @param {string} options.guildId - ID de la guild
 * @param {number} options.dropId - ID du Drop Event
 * @returns {Array} - Liste des participants
 */
function getCachedDropParticipants({ guildId, dropId }) {
  const key = CACHE_KEYS.DROP_PARTICIPANTS(guildId, dropId);
  const cached = cache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const db = require("../../database");
  const participants = db.getDropParticipants({ guildId, dropId });

  cache.set(key, participants);
  return participants;
}

// =============================================================================
// FONCTIONS DE CACHE POUR LA BOUTIQUE
// =============================================================================

/**
 * Récupère les achats boutique par statut (avec cache)
 * @param {object} options - Options de la requête
 * @param {string} options.guildId - ID de la guild
 * @param {string} options.status - Statut des achats
 * @param {number} options.limit - Nombre de résultats
 * @returns {Array} - Liste des achats
 */
function getCachedShopPurchasesByStatus({ guildId, status = "pending", limit = 10 }) {
  const key = CACHE_KEYS.SHOP_PURCHASES(guildId, status);
  const cached = cache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const db = require("../../database");
  const purchases = db.getShopPurchasesByStatus({ guildId, status, limit });

  cache.set(key, purchases);
  return purchases;
}

/**
 * Récupère les achats boutique d'un utilisateur (avec cache)
 * @param {object} options - Options de la requête
 * @param {string} options.guildId - ID de la guild
 * @param {string} options.userId - ID de l'utilisateur
 * @param {number} options.limit - Nombre de résultats
 * @returns {Array} - Liste des achats
 */
function getCachedUserShopPurchases({ guildId, userId, limit = 5 }) {
  const key = CACHE_KEYS.USER_SHOP_PURCHASES(guildId, userId);
  const cached = cache.get(key);

  if (cached !== undefined) {
    return cached;
  }

  const db = require("../../database");
  const purchases = db.getUserShopPurchases({ guildId, userId, limit });

  cache.set(key, purchases);
  return purchases;
}

// =============================================================================
// FONCTIONS D'INVALIDATION DU CACHE
// =============================================================================

/**
 * Efface le cache pour un utilisateur spécifique
 * @param {string} guildId - ID de la guild
 * @param {string} userId - ID de l'utilisateur
 */
function clearUserCache(guildId, userId) {
  const keysToDelete = cache.keys().filter(key =>
    key.includes(`:${guildId}:${userId}:`) ||
    key.includes(`points:${guildId}:${userId}`) ||
    key.includes(`rumors:${guildId}:user:${userId}`) ||
    key.includes(`quests:${guildId}:user:${userId}`) ||
    key.includes(`temp_roles:${guildId}:user:${userId}`) ||
    key.includes(`shop:${guildId}:user:${userId}`)
  );

  keysToDelete.forEach(key => cache.del(key));
  logger.debug(`Cache utilisateur effacé pour ${userId} (guild ${guildId}) : ${keysToDelete.length} entrées`);
}

/**
 * Efface le cache pour une guild spécifique
 * @param {string} guildId - ID de la guild
 */
function clearGuildCache(guildId) {
  const keysToDelete = cache.keys().filter(key => key.startsWith(`${guildId}:`));
  keysToDelete.forEach(key => cache.del(key));
  logger.debug(`Cache guild effacé pour ${guildId} : ${keysToDelete.length} entrées`);
}

/**
 * Efface le cache pour un paramètre spécifique
 * @param {string} guildId - ID de la guild
 * @param {string} key - Clé du paramètre
 */
function clearSettingCache(guildId, key) {
  const cacheKey = CACHE_KEYS.SETTING(guildId, key);
  cache.del(cacheKey);

  // aussi effacer le cache staff_role si c'est le paramètre modifié
  if (key === "staff_role_id") {
    cache.del(CACHE_KEYS.STAFF_ROLE(guildId));
  }

  logger.debug(`Cache paramètre effacé pour ${guildId}:${key}`);
}

/**
 * Efface tout le cache
 */
function clearAllCache() {
  cache.flushAll();
  logger.info("Cache complètement effacé");
}

/**
 * Récupère le nombre d'entrées dans le cache
 * @returns {number} - Nombre d'entrées
 */
function getCacheSize() {
  return cache.getStats().keys;
}

// =============================================================================
// EXPORTS
// =============================================================================

// Exporter la base pour le cache
const logger = require("./logger");

module.exports = {
  // Initialisation
  initCache,
  cache, // Export pour tests/debug

  // Points
  getCachedUserPoints,
  getCachedLeaderboard,

  // Configuration
  getCachedSetting,
  getCachedStaffRoleId,

  // Rumeurs
  getCachedRumorsByStatus,
  getCachedUserApprovedRumorCount,

  // Quêtes
  getCachedActiveQuests,
  getCachedQuestSubmissionsByStatus,
  getCachedUserApprovedQuestCount,

  // Rôles temporaires
  getCachedActiveTemporaryRoles,
  getCachedUserActiveTemporaryRoles,

  // Membre Mystère
  getCachedActiveMysteryGame,
  getCachedMysteryHints,

  // Drop Events
  getCachedActiveDropEvents,
  getCachedDropParticipants,

  // Boutique
  getCachedShopPurchasesByStatus,
  getCachedUserShopPurchases,

  // Invalidation du cache
  clearUserCache,
  clearGuildCache,
  clearSettingCache,
  clearAllCache,

  // Stats
  getCacheSize
};
