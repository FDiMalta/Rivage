const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");
const { isStaff } = require("../utils/permissions");
const { replyError, logError } = require("../utils/errors");
const db = require("../../database");
const logger = require("../utils/logger");
const {
  addDays,
  formatDateForDatabase,
  truncate
} = require("../utils/formatters");

// =============================================================================
// FACTORIES DE BOUTONS (pour éviter la duplication de code)
// =============================================================================

/**
 * Crée des boutons Approuver/Refuser génériques
 * @param {string} prefix - Préfixe pour le customId (ex: "rumor", "quest")
 * @param {number} id - ID de l'élément
 * @param {object} labels - Textes des boutons
 * @returns {ActionRowBuilder}
 */
function createActionButtons(prefix, id, labels = { approve: "Approuver", reject: "Refuser" }) {
  const approveButton = new ButtonBuilder()
    .setCustomId(`${prefix}_approve_${id}`)
    .setLabel(labels.approve)
    .setEmoji("✅")
    .setStyle(ButtonStyle.Success);

  const rejectButton = new ButtonBuilder()
    .setCustomId(`${prefix}_reject_${id}`)
    .setLabel(labels.reject)
    .setEmoji("❌")
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(approveButton, rejectButton);
}

/**
 * Crée des boutons Approuver/Refuser désactivés
 */
function createDisabledActionButtons(prefix, id, labels = { approve: "Approuver", reject: "Refuser" }) {
  const approveButton = new ButtonBuilder()
    .setCustomId(`${prefix}_approve_${id}`)
    .setLabel(labels.approve)
    .setEmoji("✅")
    .setStyle(ButtonStyle.Success)
    .setDisabled(true);

  const rejectButton = new ButtonBuilder()
    .setCustomId(`${prefix}_reject_${id}`)
    .setLabel(labels.reject)
    .setEmoji("❌")
    .setStyle(ButtonStyle.Danger)
    .setDisabled(true);

  return new ActionRowBuilder().addComponents(approveButton, rejectButton);
}

/**
 * Bouton de participation à un Drop Event
 */
function createDropButton(dropId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`drop_join_${dropId}`)
      .setLabel("Participer")
      .setEmoji("🎁")
      .setStyle(ButtonStyle.Primary)
  );
}

/**
 * Bouton de Drop Event désactivé
 */
function createDisabledDropButton(dropId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`drop_join_${dropId}`)
      .setLabel("Drop terminé")
      .setEmoji("🎁")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

// =============================================================================
// HANDLERS DE BOUTONS
// =============================================================================

/**
 * Gère les boutons de rumeur (Approuver/Refuser)
 */
async function handleRumorButton(interaction) {
  try {
    if (!isStaff(interaction.member)) {
      await replyError(interaction, "Seul le staff peut valider ou refuser les rumeurs.");
      return;
    }

    // Parser le customId (ex: "rumor_approve_12")
    const parts = interaction.customId.split("_");
    if (parts.length < 3) {
      await replyError(interaction, "Bouton invalide.");
      return;
    }

    const action = parts[1]; // "approve" ou "reject"
    const rumorId = Number(parts[2]);

    if (!rumorId || !["approve", "reject"].includes(action)) {
      await replyError(interaction, "Bouton invalide.");
      return;
    }

    // Récupérer la rumeur
    const rumor = db.getRumorById({ guildId: interaction.guildId, rumorId });
    if (!rumor) {
      await replyError(interaction, `Aucune rumeur trouvée avec l’ID #${rumorId}.`);
      return;
    }

    // Vérifier que la rumeur est en attente
    if (rumor.status !== "pending") {
      await replyError(interaction, `Cette rumeur a déjà été traitée. Statut actuel : **${rumor.status}**.`);
      return;
    }

    // Mettre à jour le statut
    const newStatus = action === "approve" ? "approved" : "rejected";
    const statusLabel = action === "approve" ? "Approuvée ✅" : "Refusée ❌";

    db.updateRumorStatus({
      guildId: interaction.guildId,
      rumorId,
      status: newStatus,
      reviewedBy: interaction.user.id,
      reviewReason: action === "reject" ? "Refusée via bouton staff." : null
    });

    // Mettre à jour l'embed
    const oldEmbed = interaction.message.embeds[0];
    if (!oldEmbed) {
      await replyError(interaction, "Impossible de mettre à jour le message.");
      return;
    }

    const updatedEmbed = EmbedBuilder.from(oldEmbed)
      .spliceFields(3, 1, { // Remplace le champ "Statut" (index 3)
        name: "Statut",
        value: `${statusLabel} par ${interaction.user}`,
        inline: true
      });

    await interaction.update({
      embeds: [updatedEmbed],
      components: [createDisabledActionButtons("rumor", rumorId)]
    });

  } catch (error) {
    logger.error("Erreur dans handleRumorButton", {
      error: error.message,
      stack: error.stack,
      customId: interaction.customId,
      user: interaction.user.tag
    });
    await replyError(interaction, "Une erreur est survenue lors du traitement de la rumeur.");
  }
}

/**
 * Gère les boutons de validation de quête (Approuver/Refuser)
 */
async function handleQuestSubmissionButton(interaction) {
  try {
    if (!isStaff(interaction.member)) {
      await replyError(interaction, "Seul le staff peut valider ou refuser les quêtes.");
      return;
    }

    // Parser le customId (ex: "quest_approve_4")
    const parts = interaction.customId.split("_");
    if (parts.length < 3) {
      await replyError(interaction, "Bouton invalide.");
      return;
    }

    const action = parts[1]; // "approve" ou "reject"
    const submissionId = Number(parts[2]);

    if (!submissionId || !["approve", "reject"].includes(action)) {
      await replyError(interaction, "Bouton invalide.");
      return;
    }

    // Récupérer la validation de quête
    const submission = db.getQuestSubmissionById({
      guildId: interaction.guildId,
      submissionId
    });

    if (!submission) {
      await replyError(interaction, `Aucune validation trouvée avec l’ID #${submissionId}.`);
      return;
    }

    // Vérifier que la validation est en attente
    if (submission.status !== "pending") {
      await replyError(interaction, `Cette validation a déjà été traitée. Statut actuel : **${submission.status}**.`);
      return;
    }

    // Si approuvé : attribuer les points et le rôle temporaire
    if (action === "approve") {
      db.updateQuestSubmissionStatus({
        guildId: interaction.guildId,
        submissionId,
        status: "approved",
        reviewedBy: interaction.user.id
      });

      // Ajouter les points
      db.addPoints({
        guildId: interaction.guildId,
        userId: submission.user_id,
        amount: submission.reward_points,
        reason: `Quête validée : ${submission.quest_title}`,
        isSecret: false,
        createdBy: interaction.user.id
      });

      // Donner le rôle temporaire si configuré
      if (submission.reward_role_id) {
        const member = await interaction.guild.members.fetch(submission.user_id).catch(() => null);
        if (member) {
          const roleDays = submission.reward_role_days ?? 7;
          const expiresAt = addDays(new Date(), roleDays);

          await member.roles.add(
            submission.reward_role_id,
            `Rôle temporaire obtenu via quête : ${submission.quest_title}`
          ).catch(async (error) => {
            logger.error("Échec de l'ajout du rôle temporaire", {
              error: error.message,
              userId: submission.user_id,
              roleId: submission.reward_role_id
            });
            // On continue même si le rôle n'a pas pu être ajouté
          });

          db.addTemporaryRole({
            guildId: interaction.guildId,
            userId: submission.user_id,
            roleId: submission.reward_role_id,
            reason: `Quête validée : ${submission.quest_title}`,
            expiresAt: formatDateForDatabase(expiresAt),
            createdBy: interaction.user.id
          });
        }
      }
    }

    // Si refusé : juste mettre à jour le statut
    if (action === "reject") {
      db.updateQuestSubmissionStatus({
        guildId: interaction.guildId,
        submissionId,
        status: "rejected",
        reviewedBy: interaction.user.id,
        reviewReason: "Refusée via bouton staff."
      });
    }

    // Mettre à jour l'embed
    const oldEmbed = interaction.message.embeds[0];
    if (!oldEmbed) {
      await replyError(interaction, "Impossible de mettre à jour le message.");
      return;
    }

    const statusLabel = action === "approve" ? "Approuvée ✅" : "Refusée ❌";
    const updatedEmbed = EmbedBuilder.from(oldEmbed)
      .spliceFields(4, 1, { // Remplace le champ "Statut" (index 4)
        name: "Statut",
        value: `${statusLabel} par ${interaction.user}`,
        inline: true
      });

    await interaction.update({
      embeds: [updatedEmbed],
      components: [createDisabledActionButtons("quest", submissionId, { approve: "Approuver", reject: "Refuser" })]
    });

  } catch (error) {
    logger.error("Erreur dans handleQuestSubmissionButton", {
      error: error.message,
      stack: error.stack,
      customId: interaction.customId,
      user: interaction.user.tag
    });
    await replyError(interaction, "Une erreur est survenue lors du traitement de la validation de quête.");
  }
}

/**
 * Gère le bouton de participation à un Drop Event
 */
async function handleDropButton(interaction) {
  try {
    // Parser le customId (ex: "drop_join_3")
    const parts = interaction.customId.split("_");
    if (parts.length < 3) {
      await replyError(interaction, "Bouton Drop invalide.");
      return;
    }

    const action = parts[1]; // "join"
    const dropId = Number(parts[2]);

    if (action !== "join" || !dropId) {
      await replyError(interaction, "Bouton Drop invalide.");
      return;
    }

    // Récupérer le Drop Event
    const drop = db.getDropEventById({ guildId: interaction.guildId, dropId });
    if (!drop) {
      await replyError(interaction, "Drop Event introuvable.");
      return;
    }

    // Vérifier que le Drop est actif
    if (drop.status !== "active") {
      await replyError(interaction, "Ce Drop Event est déjà terminé.");
      return;
    }

    // Vérifier qu'il reste des places
    const participantsBefore = db.getDropParticipants({ guildId: interaction.guildId, dropId });
    if (participantsBefore.length >= drop.max_winners) {
      await replyError(interaction, "Trop tard, tous les gagnants ont déjà été pris.");
      return;
    }

    // Essayer d'ajouter le participant (UNIQUE constraint dans la base)
    try {
      db.addDropParticipant({
        guildId: interaction.guildId,
        dropId,
        userId: interaction.user.id
      });
    } catch (error) {
      // Erreur UNIQUE : l'utilisateur participe déjà
      await replyError(interaction, "Tu participes déjà à ce Drop Event.");
      return;
    }

    // Donner les points au participant
    db.addPoints({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      amount: drop.reward_points,
      reason: `Drop Event : ${drop.title}`,
      isSecret: false,
      createdBy: interaction.client.user.id
    });

    // Récupérer les participants mis à jour
    const participants = db.getDropParticipants({ guildId: interaction.guildId, dropId });
    const winnersText = participants
      .map((participant, index) => `**${index + 1}.** <@${participant.user_id}>`)
      .join("\n");

    const isFinished = participants.length >= drop.max_winners;

    // Terminer le Drop si tous les gagnants sont trouvés
    if (isFinished) {
      db.endDropEvent({ guildId: interaction.guildId, dropId });
    }

    // Mettre à jour l'embed
    const oldEmbed = interaction.message.embeds[0];
    if (!oldEmbed) {
      await replyError(interaction, "Impossible de mettre à jour le message.");
      return;
    }

    const updatedEmbed = EmbedBuilder.from(oldEmbed)
      .spliceFields(0, 1, { // Remplace le premier champ (participants/gagnants)
        name: isFinished ? "Gagnants finaux" : "Participants",
        value: winnersText || "Aucun participant pour l’instant."
      })
      .setDescription(
        isFinished
          ? `Le Drop Event est terminé.\n\nRécompense : **+${drop.reward_points} point(s)** par gagnant.`
          : `Les **${drop.max_winners} premiers** qui cliquent gagnent.\n\n` +
            `Récompense : **+${drop.reward_points} point(s)**\n\n` +
            `Places restantes : **${drop.max_winners - participants.length}**`
      );

    await interaction.update({
      embeds: [updatedEmbed],
      components: isFinished
        ? [createDisabledDropButton(dropId)]
        : [createDropButton(dropId)]
    });

  } catch (error) {
    logger.error("Erreur dans handleDropButton", {
      error: error.message,
      stack: error.stack,
      customId: interaction.customId,
      user: interaction.user.tag
    });
    await replyError(interaction, "Une erreur est survenue lors de la participation au Drop Event.");
  }
}

/**
 * Gère les boutons de la boutique (Approuver/Refuser)
 */
async function handleShopPurchaseButton(interaction) {
  try {
    if (!isStaff(interaction.member)) {
      await replyError(interaction, "Seul le staff peut valider ou refuser les achats boutique.");
      return;
    }

    // Parser le customId (ex: "shop_approve_5")
    const parts = interaction.customId.split("_");
    if (parts.length < 3) {
      await replyError(interaction, "Bouton boutique invalide.");
      return;
    }

    const action = parts[1]; // "approve" ou "reject"
    const purchaseId = Number(parts[2]);

    if (!purchaseId || !["approve", "reject"].includes(action)) {
      await replyError(interaction, "Bouton boutique invalide.");
      return;
    }

    // Récupérer la demande d'achat
    const purchase = db.getShopPurchaseById({ guildId: interaction.guildId, purchaseId });
    if (!purchase) {
      await replyError(interaction, `Aucune demande boutique trouvée avec l’ID #${purchaseId}.`);
      return;
    }

    // Vérifier que la demande est en attente
    if (purchase.status !== "pending") {
      await replyError(interaction, `Cette demande a déjà été traitée. Statut actuel : **${purchase.status}**.`);
      return;
    }

    // Si approuvé : retirer les points
    if (action === "approve") {
      const total = db.getUserTotalPoints({
        guildId: interaction.guildId,
        userId: purchase.user_id,
        includeSecret: false
      });

      if (total < purchase.price) {
        await replyError(
          interaction,
          `❌ <@${purchase.user_id}> n’a pas assez de points publics.\nPrix : **${purchase.price}** point(s), total actuel : **${total}**.`
        );
        return;
      }

      // Retirer les points
      db.addPoints({
        guildId: interaction.guildId,
        userId: purchase.user_id,
        amount: -purchase.price,
        reason: `Achat boutique : ${purchase.item_name}`,
        isSecret: false,
        createdBy: interaction.user.id
      });

      // Mettre à jour le statut
      db.updateShopPurchaseStatus({
        guildId: interaction.guildId,
        purchaseId,
        status: "approved",
        reviewedBy: interaction.user.id,
        reviewReason: "Achat approuvé via bouton staff."
      });

      // Mettre à jour l'embed (vert pour approuvé)
      const oldEmbed = interaction.message.embeds[0];
      if (!oldEmbed) {
        await replyError(interaction, "Impossible de mettre à jour le message.");
        return;
      }

      const updatedEmbed = EmbedBuilder.from(oldEmbed)
        .setColor(0x2ecc71) // Vert
        .spliceFields(5, 1, { // Remplace le champ "Verdict" (index 5)
          name: "⚖️ Verdict",
          value: `✅ Achat approuvé par ${interaction.user}.\nLes **${purchase.price} point(s)** ont été retirés.`,
          inline: false
        });

      await interaction.update({
        embeds: [updatedEmbed],
        components: [createDisabledActionButtons("shop", purchaseId, { approve: "Approuver l’achat", reject: "Refuser l’achat" })]
      });
      return;
    }

    // Si refusé : juste mettre à jour le statut
    db.updateShopPurchaseStatus({
      guildId: interaction.guildId,
      purchaseId,
      status: "rejected",
      reviewedBy: interaction.user.id,
      reviewReason: "Achat refusé via bouton staff."
    });

    // Mettre à jour l'embed (rouge pour refusé)
    const oldEmbed = interaction.message.embeds[0];
    if (!oldEmbed) {
      await replyError(interaction, "Impossible de mettre à jour le message.");
      return;
    }

    const updatedEmbed = EmbedBuilder.from(oldEmbed)
      .setColor(0xe74c3c) // Rouge
      .spliceFields(5, 1, { // Remplace le champ "Verdict" (index 5)
        name: "⚖️ Verdict",
        value: `❌ Achat refusé par ${interaction.user}.`,
        inline: false
      });

    await interaction.update({
      embeds: [updatedEmbed],
      components: [createDisabledActionButtons("shop", purchaseId, { approve: "Approuver l’achat", reject: "Refuser l’achat" })]
    });

  } catch (error) {
    logger.error("Erreur dans handleShopPurchaseButton", {
      error: error.message,
      stack: error.stack,
      customId: interaction.customId,
      user: interaction.user.tag
    });
    await replyError(interaction, "Une erreur est survenue lors du traitement de la demande boutique.");
  }
}

// =============================================================================
// ROUTEUR DES BOUTONS
// =============================================================================

/**
 * Route les interactions de boutons vers le bon handler
 */
async function handleButtonInteraction(interaction, client) {
  try {
    if (interaction.customId.startsWith("rumor_")) {
      await handleRumorButton(interaction);
      return;
    }

    if (interaction.customId.startsWith("quest_")) {
      await handleQuestSubmissionButton(interaction);
      return;
    }

    if (interaction.customId.startsWith("drop_")) {
      await handleDropButton(interaction);
      return;
    }

    if (interaction.customId.startsWith("shop_")) {
      await handleShopPurchaseButton(interaction);
      return;
    }

    // Si aucun handler ne correspond
    logger.warn(`Aucun handler trouvé pour le bouton : ${interaction.customId}`);
    await replyError(interaction, "Ce bouton n'est plus valide ou a expiré.");

  } catch (error) {
    logger.error("Erreur dans le routeur des boutons", {
      error: error.message,
      stack: error.stack,
      customId: interaction.customId,
      user: interaction.user.tag
    });
    await replyError(interaction, "Une erreur est survenue lors du traitement du bouton.");
  }
}

// Exports
module.exports = {
  handleButtonInteraction,
  // Factories de boutons (pour les tests ou réutilisation)
  createActionButtons,
  createDisabledActionButtons,
  createDropButton,
  createDisabledDropButton
};
