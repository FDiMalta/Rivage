const { EmbedBuilder } = require("discord.js");
const cron = require("node-cron");
const db = require("../../database");
const logger = require("../utils/logger");
const { getCachedSetting } = require("../utils/cache");

// =============================================================================
// FONCTION PRINCIPALE : ENVOI DU RAPPEL DE BUMP (toutes les 2h)
// =============================================================================

/**
 * Planifie l'envoi automatique des rappels de bump (toutes les 2 heures)
 * @param {Client} client - Client Discord
 */
function sendBumpReminderJob(client) {
  // Exécuté toutes les 2 heures
  const cronJob = "0 */2 * * *";

  /**
   * Vérifie et envoie les rappels pour toutes les guilds
   */
  const checkAndSend = async () => {
    try {
      const guilds = await client.guilds.fetch().catch(() => []);
      for (const guild of guilds.values()) {
        await checkScheduledBumpReminder(client, guild.id).catch(error => {
          logger.error("Erreur dans checkScheduledBumpReminder", {
            guildId: guild.id,
            error: error.message
          });
        });
      }
    } catch (error) {
      logger.error("Erreur dans le job sendBumpReminderJob", {
        error: error.message,
        stack: error.stack
      });
    }
  };

  // Lancer immédiatement au démarrage
  checkAndSend();

  // Planifier avec cron
  cron.schedule(cronJob, checkAndSend, {
    scheduled: true,
    timezone: "Europe/Paris"
  });

  logger.info("Job sendBumpReminderJob démarré (toutes les 2h)");
}

// =============================================================================
// VÉRIFIE SI UN RAPPEL BUMP DOIT ÊTRE ENVYÉ POUR UNE GUILD
// =============================================================================

/**
 * Vérifie si un rappel bump doit être envoyé pour une guild spécifique
 * @param {Client} client - Client Discord
 * @param {string} guildId - ID de la guild
 */
async function checkScheduledBumpReminder(client, guildId) {
  if (!guildId) return;

  try {
    const nextBumpAt = getCachedSetting({ guildId, key: "next_bump_at" });
    if (!nextBumpAt) return;

    const nextDate = new Date(nextBumpAt);
    if (Number.isNaN(nextDate.getTime())) {
      logger.warn(`Date de prochain bump invalide pour la guild ${guildId}: ${nextBumpAt}`);
      // Réinitialiser la valeur invalide
      db.setSetting({ guildId, key: "next_bump_at", value: "" });
      return;
    }

    if (nextDate > new Date()) return;

    await sendBumpReminder(client, guildId);

    // Réinitialiser le timer
    db.setSetting({ guildId, key: "next_bump_at", value: "" });
    logger.info(`Rappel bump envoyé pour la guild ${guildId}`);

  } catch (error) {
    logger.error("Erreur dans checkScheduledBumpReminder", {
      guildId,
      error: error.message,
      stack: error.stack
    });
  }
}

// =============================================================================
// ENVOIE UN RAPPEL DE BUMP POUR UNE GUILD
// =============================================================================

/**
 * Envoie un rappel de bump dans le salon configuré
 * @param {Client} client - Client Discord
 * @param {string} guildId - ID de la guild
 */
async function sendBumpReminder(client, guildId) {
  try {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      logger.warn(`Serveur introuvable pour le rappel bump (guildId: ${guildId})`);
      return;
    }

    const bumpChannelId = getCachedSetting({ guildId, key: "bump_channel_id" });
    const bumpRoleId = getCachedSetting({ guildId, key: "bump_role_id" });

    if (!bumpChannelId || !bumpRoleId) {
      logger.info(`Rappel bump non configuré pour ${guildId} : salon ou rôle manquant.`);
      return;
    }

    const channel = await guild.channels.fetch(bumpChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      logger.warn(`Salon bump introuvable ou invalide pour ${guildId} (channelId: ${bumpChannelId})`);
      return;
    }

    const role = await guild.roles.fetch(bumpRoleId).catch(() => null);
    if (!role) {
      logger.warn(`Rôle bump introuvable pour ${guildId} (roleId: ${bumpRoleId})`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("╭━━━ 🔔 Bump BDL ━━━╮")
      .setDescription(
        "⏰ **C’est l’heure de bump le serveur !**\n\n" +
        "Utilise la commande de bump pour aider le serveur à gagner en visibilité.\n" +
        "✦ Merci aux soldats du référencement ✦"
      )
      .setColor(0x9b59b6)
      .setTimestamp();

    await channel.send({
      content: `${role}`,
      embeds: [embed]
    });

    logger.info(`Rappel bump envoyé dans ${guild.name} (salon: ${channel.name})`);

  } catch (error) {
    logger.error("Erreur dans sendBumpReminder", {
      guildId,
      error: error.message,
      stack: error.stack
    });
  }
}

// =============================================================================
// DÉTECTE LES CONFIRMATIONS DE BUMP DE DISBOARD
// =============================================================================

/**
 * Détecte les messages de confirmation de bump de DISBOARD
 * et programme le prochain rappel dans 2 heures
 * @param {Message} message - Message Discord
 * @param {Client} client - Client Discord
 */
async function handleDisboardBumpMessage(message, client) {
  try {
    // Ignorer si ce n'est pas un message de guild
    if (!message.guild) return;

    // Vérifier que le message vient du bot DISBOARD (ID officiel)
    if (message.author.id !== "302050872383242240") return;

    // Extraire tout le contenu du message (texte + embeds)
    const rawContent = [
      message.content ?? "",
      ...message.embeds.map(embed => {
        return [
          embed.title ?? "",
          embed.description ?? "",
          ...(embed.fields ?? []).map(field => `${field.name} ${field.value}`)
        ].join(" ");
      })
    ].join(" ").toLowerCase();

    // Vérifier si c'est une confirmation de bump réussie
    const isSuccessfulBump =
      rawContent.includes("bump done") ||
      rawContent.includes("bumped") ||
      rawContent.includes("serveur bump") ||
      rawContent.includes("server bumped");

    if (!isSuccessfulBump) return;

    // Planifier le prochain rappel dans 2 heures
    const nextBumpAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    db.setSetting({
      guildId: message.guild.id,
      key: "next_bump_at",
      value: nextBumpAt
    });

    logger.info(`Bump détecté pour ${message.guild.name}. Prochain rappel à ${nextBumpAt}`);

  } catch (error) {
    logger.error("Erreur dans handleDisboardBumpMessage", {
      guildId: message.guild?.id,
      error: error.message,
      stack: error.stack
    });
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  sendBumpReminderJob,
  checkScheduledBumpReminder,
  sendBumpReminder,
  handleDisboardBumpMessage
};
