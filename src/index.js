require("dotenv").config();
// Module Node natif pour manipuler les fichiers.
const fs = require("node:fs");
const path = require("node:path");
// Librairie pour les tâches planifiées.
const cron = require("node-cron");
// Imports principaux de discord.js.
const {
    Client,
    GatewayIntentBits,
    Events,
    PermissionFlagsBits,
    EmbedBuilder,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder
} = require("discord.js");
// Import de toutes les fonctions de database.js.
const {
    // Points
    addPoints,
    getUserTotalPoints,
    getLeaderboard,
    getMonthlyLeaderboard,
    getUserPointsHistory,
    getUserRank,
    // Rumeurs
    addRumor,
    getRumorsByStatus,
    updateRumorStatus,
    getRumorById,
    getUserApprovedRumorCount,
    // Configuration
    setSetting,
    getSetting,
    getAllSettings,
    // Quêtes
    addQuest,
    getActiveQuests,
    getQuestById,
    addQuestSubmission,
    getQuestSubmissionsByStatus,
    getQuestSubmissionById,
    updateQuestSubmissionStatus,
    closeQuest,
    getUserApprovedQuestCount,
    // Rôles temporaires
    addTemporaryRole,
    getExpiredTemporaryRoles,
    markTemporaryRoleRemoved,
    getActiveTemporaryRoles,
    getUserActiveTemporaryRoles,
    // Membre Mystère
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
    // Drop Events
    createDropEvent,
    setDropMessageId,
    getDropEventById,
    addDropParticipant,
    getDropParticipants,
    endDropEvent,
    // Boutique de points
    addShopPurchase,
    getShopPurchaseById,
    getShopPurchasesByStatus,
    getUserShopPurchases,
    updateShopPurchaseStatus,
    // Backup / statistiques
    getBackupStats,
    getActiveTemporaryRoleCount,
    getPendingRumorCount,
    getPendingQuestSubmissionCount,
    // Archive / nettoyage
    deleteOldDropEvents,
    deleteOldRejectedRumors,
    deleteOldMysteryGames,
    deleteOldRemovedTemporaryRoles,
    vacuumDatabase
} = require("./database");
// Création du client Discord.
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});
/* =========================
   OUTILS
========================= */
// Vérifie si un membre est staff.
function isStaff(member) {
    if (!member) return false;
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    if (member.permissions.has(PermissionFlagsBits.ManageRoles)) return true;
    const staffRoleId = getSetting({ guildId: member.guild.id, key: "staff_role_id" });
    if (!staffRoleId) return false;
    return member.roles.cache.has(staffRoleId);
}
// Coupe un texte trop long.
function truncate(text, maxLength = 900) {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + "...";
}
// Transforme les \n en vrais retours à la ligne.
function formatMultilineInput(text, maxLength = 900) {
    if (!text) return "";
    return truncate(
        text.replace(/\\n/g, "\n").replace(/<br>/gi, "\n"),
        maxLength
    );
}
// Applique une image à un embed.
function applyAttachmentImage(embed, attachment) {
    if (!attachment) return embed;
    if (attachment.contentType && !attachment.contentType.startsWith("image/")) return embed;
    return embed.setImage(attachment.url);
}
// ===== BOUTIQUE =====
const SHOP_ITEMS = {
    emoji_personnalise: {
        name: "🎨 Emoji personnalisé sur le serveur",
        price: 50,
        description: "Demande l'ajout d'un emoji personnalisé sur le serveur."
    },
    commande_personnalisee: {
        name: "💻 Commande personnalisée",
        price: 60,
        description: "Crée une commande slash personnalisée pour le bot."
    },
    xp_boost: {
        name: "⚡ Boost d'XP",
        price: 15,
        description: "Obtiens +10 XP pour ton profil."
    },
    nude_colo: {
        name: "📸 Nude de colo",
        price: 200,
        description: "Obtiens une incroyable nude de l'admin adoré Colo."
    },
    trophee_personnalise: {
        name: "🏆 Trophée personnalisé",
        price: 100,
        description: "Obtiens un trophée personnalisé unique. **Limité à 1 par personne.**"
    },
    theme_gazette: {
        name: "📰 Thème de Gazette",
        price: 30,
        description: "Propose le thème principal de la prochaine Gazette."
    },
    film_soiree: {
        name: "🎬 Choisir le film des soirées popcorn",
        price: 20,
        description: "Choisis le film pour la prochaine soirée popcorn."
    }
};
function formatShopItemList() {
    return Object.entries(SHOP_ITEMS)
        .sort((a, b) => a[1].price - b[1].price)
        .map(([key, item]) => {
            return `**${item.name}** — **${item.price} points**\n${item.description}\n\`/boutique acheter item:${key} note:...\``;
        })
        .join("\n\n");
}
// Génère une URL de bannière avec le nombre de points.
function getPointsBannerUrl(points) {
    return `https://via.placeholder.com/600x200/9b59b6/FFFFFF?text=+${points}+POINTS+BDL`;
}
// Ajoute un nombre de jours à une date.
function addDays(date, days) {
    const result = new Date(date.getTime());
    result.setDate(result.getDate() + days);
    return result;
}
// Formate une date pour la base SQLite.
function formatDateForDatabase(date) {
    return date.toISOString();
}
// Calcule une date limite pour le nettoyage.
function getCleanupDate(days) {
    return formatDateForDatabase(subtractDays(new Date(), days));
}
// Retire un nombre de jours à une date.
function subtractDays(date, days) {
    const result = new Date(date.getTime());
    result.setDate(result.getDate() - days);
    return result;
}
// Formate la taille d'un fichier.
function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} o`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(2)} Ko`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} Mo`;
}
// Génère une clé de semaine (ex: 2026-S21).
function getWeekKey(date = new Date()) {
    const year = date.getFullYear();
    const firstDayOfYear = new Date(year, 0, 1);
    const pastDaysOfYear = Math.floor((date - firstDayOfYear) / 86400000);
    const weekNumber = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    return `${year}-S${String(weekNumber).padStart(2, "0")}`;
}
// Fonction d'erreur propre.
async function replyError(interaction, message = "Une erreur est survenue.") {
    const payload = { content: `❌ ${message}`, flags: MessageFlags.Ephemeral };
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(payload);
        } else {
            await interaction.reply(payload);
        }
    } catch (error) {
        console.error("Impossible d'envoyer le message d'erreur :", error);
    }
}
/* =========================
   BOUTONS
========================= */
function createRumorButtons(rumorId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`rumor_approve_${rumorId}`)
            .setLabel("Approuver")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`rumor_reject_${rumorId}`)
            .setLabel("Refuser")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger)
    );
}
function createDisabledRumorButtons(rumorId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`rumor_approve_${rumorId}`)
            .setLabel("Approuver")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`rumor_reject_${rumorId}`)
            .setLabel("Refuser")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true)
    );
}
function createQuestSubmissionButtons(submissionId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`quest_approve_${submissionId}`)
            .setLabel("Approuver")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`quest_reject_${submissionId}`)
            .setLabel("Refuser")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger)
    );
}
function createDisabledQuestSubmissionButtons(submissionId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`quest_approve_${submissionId}`)
            .setLabel("Approuver")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`quest_reject_${submissionId}`)
            .setLabel("Refuser")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true)
    );
}
function createDropButton(dropId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`drop_join_${dropId}`)
            .setLabel("Participer")
            .setEmoji("🎁")
            .setStyle(ButtonStyle.Primary)
    );
}
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
function createShopPurchaseButtons(purchaseId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`shop_approve_${purchaseId}`)
            .setLabel("Approuver")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`shop_reject_${purchaseId}`)
            .setLabel("Refuser")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger)
    );
}
function createDisabledShopPurchaseButtons(purchaseId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`shop_approve_${purchaseId}`)
            .setLabel("Approuver")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId(`shop_reject_${purchaseId}`)
            .setLabel("Refuser")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true)
    );
}
/* =========================
   HANDLERS BOUTONS
========================= */
async function handleRumorButton(interaction) {
    if (!isStaff(interaction.member)) {
        await replyError(interaction, "Seul le staff peut valider ou refuser les rumeurs.");
        return;
    }
    const parts = interaction.customId.split("_");
    const action = parts[1];
    const rumorId = Number(parts[2]);
    if (!rumorId || !["approve", "reject"].includes(action)) {
        await replyError(interaction, "Bouton invalide.");
        return;
    }
    const rumor = getRumorById({ guildId: interaction.guildId, rumorId });
    if (!rumor) {
        await replyError(interaction, `Aucune rumeur trouvée avec l’ID #${rumorId}.`);
        return;
    }
    if (rumor.status !== "pending") {
        await replyError(interaction, `Cette rumeur a déjà été traitée (statut : ${rumor.status}).`);
        return;
    }
    const oldEmbed = interaction.message.embeds?.[0];
    if (!oldEmbed) {
        await replyError(interaction, "Impossible de mettre à jour ce message (embed manquant).");
        return;
    }
    const newStatus = action === "approve" ? "approved" : "rejected";
    const statusLabel = action === "approve" ? "Approuvée ✅" : "Refusée ❌";
    updateRumorStatus({
        guildId: interaction.guildId,
        rumorId,
        status: newStatus,
        reviewedBy: interaction.user.id,
        reviewReason: action === "reject" ? "Refusée via bouton staff." : null
    });
    const updatedEmbed = EmbedBuilder.from(oldEmbed)
        .spliceFields(3, 1, { name: "Statut", value: `${statusLabel} par ${interaction.user}`, inline: true });
    await interaction.update({
        embeds: [updatedEmbed],
        components: [createDisabledRumorButtons(rumorId)]
    }).catch(() => replyError(interaction, "Impossible de mettre à jour le message."));
}
async function handleQuestSubmissionButton(interaction) {
    if (!isStaff(interaction.member)) {
        await replyError(interaction, "Seul le staff peut valider ou refuser les quêtes.");
        return;
    }
    const parts = interaction.customId.split("_");
    const action = parts[1];
    const submissionId = Number(parts[2]);
    if (!submissionId || !["approve", "reject"].includes(action)) {
        await replyError(interaction, "Bouton invalide.");
        return;
    }
    const submission = getQuestSubmissionById({ guildId: interaction.guildId, submissionId });
    if (!submission) {
        await replyError(interaction, `Aucune validation trouvée avec l’ID #${submissionId}.`);
        return;
    }
    if (submission.status !== "pending") {
        await replyError(interaction, `Cette validation a déjà été traitée (statut : ${submission.status}).`);
        return;
    }
    const oldEmbed = interaction.message.embeds?.[0];
    if (!oldEmbed) {
        await replyError(interaction, "Impossible de mettre à jour ce message (embed manquant).");
        return;
    }
    if (action === "approve") {
        updateQuestSubmissionStatus({
            guildId: interaction.guildId,
            submissionId,
            status: "approved",
            reviewedBy: interaction.user.id
        });
        addPoints({
            guildId: interaction.guildId,
            userId: submission.user_id,
            amount: submission.reward_points,
            reason: `Quête validée : ${submission.quest_title}`,
            isSecret: false,
            createdBy: interaction.user.id
        });
        if (submission.reward_role_id) {
            const member = await interaction.guild.members.fetch(submission.user_id).catch(() => null);
            if (!member) {
                await interaction.followUp({
                    content: "⚠️ Le membre a quitté le serveur. Les points ont été attribués, mais pas le rôle.",
                    flags: MessageFlags.Ephemeral
                }).catch(() => null);
            } else {
                const roleDays = submission.reward_role_days ?? 7;
                const expiresAt = addDays(new Date(), roleDays);
                await member.roles.add(
                    submission.reward_role_id,
                    `Rôle temporaire : ${submission.quest_title}`
                ).catch(console.error);
                addTemporaryRole({
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
    if (action === "reject") {
        updateQuestSubmissionStatus({
            guildId: interaction.guildId,
            submissionId,
            status: "rejected",
            reviewedBy: interaction.user.id,
            reviewReason: "Refusée via bouton staff."
        });
    }
    const statusLabel = action === "approve" ? "Approuvée ✅" : "Refusée ❌";
    const updatedEmbed = EmbedBuilder.from(oldEmbed)
        .spliceFields(4, 1, { name: "Statut", value: `${statusLabel} par ${interaction.user}`, inline: true });
    await interaction.update({
        embeds: [updatedEmbed],
        components: [createDisabledQuestSubmissionButtons(submissionId)]
    }).catch(() => replyError(interaction, "Impossible de mettre à jour le message."));
}
async function handleDropButton(interaction) {
    const parts = interaction.customId.split("_");
    const action = parts[1];
    const dropId = Number(parts[2]);
    if (action !== "join" || !dropId) {
        await replyError(interaction, "Bouton Drop invalide.");
        return;
    }
    const drop = getDropEventById({ guildId: interaction.guildId, dropId });
    if (!drop) {
        await replyError(interaction, "Drop Event introuvable.");
        return;
    }
    if (drop.status !== "active") {
        await replyError(interaction, "Ce Drop Event est déjà terminé.");
        return;
    }
    const participantsBefore = getDropParticipants({ guildId: interaction.guildId, dropId });
    if (participantsBefore.length >= drop.max_winners) {
        await replyError(interaction, "Trop tard, tous les gagnants ont déjà été pris.");
        return;
    }
    try {
        addDropParticipant({ guildId: interaction.guildId, dropId, userId: interaction.user.id });
    } catch (error) {
        await replyError(interaction, "Tu participes déjà à ce Drop Event.");
        return;
    }
    addPoints({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        amount: drop.reward_points,
        reason: `Drop Event : ${drop.title}`,
        isSecret: false,
        createdBy: interaction.client.user.id
    });
    const participants = getDropParticipants({ guildId: interaction.guildId, dropId });
    const winnersText = participants.map((p, i) => `**${i + 1}.** <@${p.user_id}>`).join("\n");
    const isFinished = participants.length >= drop.max_winners;
    if (isFinished) endDropEvent({ guildId: interaction.guildId, dropId });
    const oldEmbed = interaction.message.embeds?.[0];
    if (!oldEmbed) {
        await replyError(interaction, "Impossible de mettre à jour ce message (embed manquant).");
        return;
    }
    const updatedEmbed = EmbedBuilder.from(oldEmbed)
        .spliceFields(0, 1, {
            name: isFinished ? "🎁 Gagnants finaux" : "🎁 Participants",
            value: winnersText || "Aucun participant pour l’instant."
        })
        .setDescription(
            isFinished
                ? `Le Drop Event est terminé.\n\nRécompense : **+${drop.reward_points} point(s)** par gagnant.`
                : `Les **${drop.max_winners} premiers** à cliquer gagnent.\n\n` +
                  `Récompense : **+${drop.reward_points} point(s)**\n\n` +
                  `Places restantes : **${drop.max_winners - participants.length}**`
        );
    await interaction.update({
        embeds: [updatedEmbed],
        components: isFinished ? [createDisabledDropButton(dropId)] : [createDropButton(dropId)]
    }).catch(() => replyError(interaction, "Impossible de mettre à jour le message."));
}
async function handleShopPurchaseButton(interaction) {
    if (!isStaff(interaction.member)) {
        await replyError(interaction, "Seul le staff peut valider ou refuser les achats boutique.");
        return;
    }
    const parts = interaction.customId.split("_");
    const action = parts[1];
    const purchaseId = Number(parts[2]);
    if (!purchaseId || !["approve", "reject"].includes(action)) {
        await replyError(interaction, "Bouton boutique invalide.");
        return;
    }
    const purchase = getShopPurchaseById({ guildId: interaction.guildId, purchaseId });
    if (!purchase) {
        await replyError(interaction, `Aucune demande boutique trouvée avec l’ID #${purchaseId}.`);
        return;
    }
    if (purchase.status !== "pending") {
        await replyError(interaction, `Cette demande a déjà été traitée (statut : ${purchase.status}).`);
        return;
    }
    const oldEmbed = interaction.message.embeds?.[0];
    if (!oldEmbed) {
        await replyError(interaction, "Impossible de mettre à jour ce message (embed manquant).");
        return;
    }
    if (action === "approve" && purchase.item_key === "trophee_personnalise") {
        const existingPurchases = getShopPurchasesByStatus({
            guildId: interaction.guildId,
            status: "approved"
        }) || [];
        const existingTrophees = existingPurchases.filter(p => p.user_id === purchase.user_id && p.item_key === "trophee_personnalise");
        if (existingTrophees.length >= 1) {
            await interaction.reply({
                content: "❌ **Limite atteinte** : 1 trophée personnalisé max par membre.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }
    if (action === "approve") {
        const total = getUserTotalPoints({
            guildId: interaction.guildId,
            userId: purchase.user_id,
            includeSecret: false
        });
        if (total < purchase.price) {
            await interaction.reply({
                content: `❌ <@${purchase.user_id}> n’a pas assez de points publics.\nPrix : **${purchase.price}**, total actuel : **${total}**.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        addPoints({
            guildId: interaction.guildId,
            userId: purchase.user_id,
            amount: -purchase.price,
            reason: `Achat boutique : ${purchase.item_name}`,
            isSecret: false,
            createdBy: interaction.user.id
        });
        updateShopPurchaseStatus({
            guildId: interaction.guildId,
            purchaseId,
            status: "approved",
            reviewedBy: interaction.user.id,
            reviewReason: "Achat approuvé via bouton staff."
        });
        const embed = EmbedBuilder.from(oldEmbed)
            .setColor(0x2ecc71)
            .spliceFields(5, 1, {
                name: "⚖️ Verdict",
                value: `✅ Achat approuvé par ${interaction.user}.\nLes **${purchase.price} points** ont été retirés.`,
                inline: false
            });
        await interaction.update({ embeds: [embed], components: [createDisabledShopPurchaseButtons(purchaseId)] });
        return;
    }
    updateShopPurchaseStatus({
        guildId: interaction.guildId,
        purchaseId,
        status: "rejected",
        reviewedBy: interaction.user.id,
        reviewReason: "Achat refusé via bouton staff."
    });
    const embed = EmbedBuilder.from(oldEmbed)
        .setColor(0xe74c3c)
        .spliceFields(5, 1, {
            name: "⚖️ Verdict",
            value: `❌ Achat refusé par ${interaction.user}.`,
            inline: false
        });
    await interaction.update({ embeds: [embed], components: [createDisabledShopPurchaseButtons(purchaseId)] });
}
// Routeur des boutons.
async function handleButtonInteraction(interaction) {
    if (interaction.customId.startsWith("rumor_")) await handleRumorButton(interaction);
    else if (interaction.customId.startsWith("quest_")) await handleQuestSubmissionButton(interaction);
    else if (interaction.customId.startsWith("drop_")) await handleDropButton(interaction);
    else if (interaction.customId.startsWith("shop_")) await handleShopPurchaseButton(interaction);
}
/* =========================
   JOBS AUTOMATIQUES
========================= */
async function cleanupExpiredTemporaryRoles(client) {
    const now = new Date().toISOString();
    const expiredRoles = getExpiredTemporaryRoles({ now });
    if (expiredRoles.length === 0) return;
    for (const tempRole of expiredRoles) {
        const guild = await client.guilds.fetch(tempRole.guild_id).catch(() => null);
        if (!guild) {
            markTemporaryRoleRemoved({ id: tempRole.id });
            continue;
        }
        const member = await guild.members.fetch(tempRole.user_id).catch(() => null);
        if (!member) {
            markTemporaryRoleRemoved({ id: tempRole.id });
            continue;
        }
        await member.roles.remove(tempRole.role_id, "Rôle temporaire BDL expiré").catch(() => null);
        markTemporaryRoleRemoved({ id: tempRole.id });
    }
    console.log(`🧹 ${expiredRoles.length} rôle(s) temporaire(s) expiré(s) nettoyé(s).`);
}
async function publishMysteryHint(client, guildId, hintNumber) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
        console.log("❌ Serveur introuvable pour publier l’indice mystère.");
        return;
    }
    const game = getActiveMysteryGame({ guildId });
    if (!game) {
        console.log("📭 Aucun Membre Mystère actif.");
        return;
    }
    const hint = getMysteryHintByNumber({ guildId, gameId: game.id, hintNumber });
    if (!hint) {
        console.log(`📭 Aucun indice #${hintNumber} trouvé.`);
        return;
    }
    if (hint.published === 1) {
        console.log(`ℹ️ Indice #${hintNumber} déjà publié.`);
        return;
    }
    const mysteryChannelId = getSetting({ guildId, key: "mystery_channel_id" });
    if (!mysteryChannelId) {
        console.log("❌ Aucun salon Membre Mystère configuré.");
        return;
    }
    const channel = await guild.channels.fetch(mysteryChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        console.log("❌ Salon Membre Mystère introuvable ou invalide.");
        return;
    }
    const embed = new EmbedBuilder()
        .setTitle(`🕵️ Membre Mystère — Indice #${hintNumber}`)
        .setDescription(hint.content)
        .setFooter({ text: "Faites vos propositions avec /mystere guess" })
        .setTimestamp();
    await channel.send({ embeds: [embed] });
    markMysteryHintPublished({ guildId, gameId: game.id, hintNumber });
    console.log(`✅ Indice Membre Mystère #${hintNumber} publié.`);
}
async function sendMysteryRevealReminder(client, guildId) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
        console.log("❌ Serveur introuvable pour le rappel Membre Mystère.");
        return;
    }
    const game = getActiveMysteryGame({ guildId });
    if (!game) {
        console.log("📭 Aucun Membre Mystère actif pour le rappel.");
        return;
    }
    const mysteryChannelId = getSetting({ guildId, key: "mystery_channel_id" });
    if (!mysteryChannelId) {
        console.log("❌ Aucun salon Membre Mystère configuré pour le rappel.");
        return;
    }
    const channel = await guild.channels.fetch(mysteryChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        console.log("❌ Salon Membre Mystère introuvable pour le rappel.");
        return;
    }
    const embed = new EmbedBuilder()
        .setTitle("🕵️ Révélation du Membre Mystère ce soir")
        .setDescription("La révélation officielle aura lieu à **21h**.\n\nDernière chance pour faire une proposition avec `/mystere guess`.")
        .setTimestamp();
    await channel.send({ embeds: [embed] });
    console.log("✅ Rappel de révélation Membre Mystère envoyé.");
}
async function sendBumpReminder(client, guildId) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
        console.log("❌ Serveur introuvable pour le rappel bump.");
        return;
    }
    const bumpChannelId = getSetting({ guildId, key: "bump_channel_id" });
    const bumpRoleId = getSetting({ guildId, key: "bump_role_id" });
    if (!bumpChannelId || !bumpRoleId) {
        console.log("📭 Rappel bump non configuré : salon ou rôle manquant.");
        return;
    }
    const channel = await guild.channels.fetch(bumpChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        console.log("❌ Salon bump introuvable ou invalide.");
        return;
    }
    const role = await guild.roles.fetch(bumpRoleId).catch(() => null);
    if (!role) {
        console.log("❌ Rôle bump introuvable.");
        return;
    }
    const embed = new EmbedBuilder()
        .setTitle("╭━━━ 🔔 Bump BDL ━━━╮")
        .setDescription("⏰ **C’est l’heure de bump le serveur !**\n\nUtilise la commande de bump pour aider le serveur à gagner en visibilité.\n✦ Merci aux soldats du référencement ✦")
        .setColor(0x9b59b6)
        .setTimestamp();
    await channel.send({ content: `${role}`, embeds: [embed] });
    console.log("✅ Rappel bump envoyé.");
}
async function handleDisboardBumpMessage(message) {
    if (!message.guild) return;
    if (message.author.id !== "302050872383242240") return;
    const rawContent = [
        message.content ?? "",
        ...(message.embeds?.map(embed =>
            [embed.title ?? "", embed.description ?? "", ...(embed.fields ?? []).map(f => `${f.name} ${f.value}`)].join(" ")
        ) ?? [])
    ].join(" ").toLowerCase();
    const isSuccessfulBump =
        rawContent.includes("bump done") ||
        rawContent.includes("bumped") ||
        rawContent.includes("serveur bump") ||
        rawContent.includes("server bumped");
    if (!isSuccessfulBump) return;
    const nextBumpAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    setSetting({ guildId: message.guild.id, key: "next_bump_at", value: nextBumpAt });
    console.log(`✅ Bump détecté. Prochain rappel programmé à ${nextBumpAt}.`);
}
async function checkScheduledBumpReminder(client, guildId) {
    if (!guildId) return;
    const nextBumpAt = getSetting({ guildId, key: "next_bump_at" });
    if (!nextBumpAt) return;
    const nextDate = new Date(nextBumpAt);
    if (Number.isNaN(nextDate.getTime()) || nextDate > new Date()) return;
    await sendBumpReminder(client, guildId);
    setSetting({ guildId, key: "next_bump_at", value: "" });
}
/* =========================
   COMMANDES SLASH
========================= */
async function handleCommandInteraction(interaction) {
    if (!interaction.guild) {
        await replyError(interaction, "Cette commande ne fonctionne que dans un serveur.");
        return;
    }
    // /ping
    if (interaction.commandName === "ping") {
        await interaction.reply("Pong 🏓 Le bot BDL fonctionne !");
        return;
    }
    // ===== POINTS =====
    if (interaction.commandName === "points") {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "ajouter") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Tu n’as pas la permission d’ajouter des points.");
                return;
            }
            const membre = interaction.options.getUser("membre");
            const nombre = interaction.options.getInteger("nombre");
            const raison = interaction.options.getString("raison");
            const secret = interaction.options.getBoolean("secret") ?? false;
            addPoints({
                guildId: interaction.guildId,
                userId: membre.id,
                amount: nombre,
                reason: raison,
                isSecret: secret,
                createdBy: interaction.user.id
            });
            const totalPublic = getUserTotalPoints({ guildId: interaction.guildId, userId: membre.id, includeSecret: false });
            await interaction.reply(
                secret
                    ? `🕵️ **${nombre} point(s) secret(s)** ajoutés à ${membre}.\nRaison : ${raison}`
                    : `🏆 ${membre} gagne **+${nombre} point(s)** !\nRaison : ${raison}\nTotal public : **${totalPublic} point(s)**.`
            );
            return;
        }
        if (subcommand === "retirer") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Tu n’as pas la permission de retirer des points.");
                return;
            }
            const membre = interaction.options.getUser("membre");
            const nombre = interaction.options.getInteger("nombre");
            const raison = interaction.options.getString("raison");
            const secret = interaction.options.getBoolean("secret") ?? false;
            addPoints({
                guildId: interaction.guildId,
                userId: membre.id,
                amount: -nombre,
                reason: `Retrait : ${raison}`,
                isSecret: secret,
                createdBy: interaction.user.id
            });
            const totalPublic = getUserTotalPoints({ guildId: interaction.guildId, userId: membre.id, includeSecret: false });
            const totalAvecSecrets = getUserTotalPoints({ guildId: interaction.guildId, userId: membre.id, includeSecret: true });
            await interaction.reply(
                secret
                    ? `🕵️ **-${nombre} point(s) secret(s)** retirés à ${membre}.\nRaison : ${raison}\nTotal avec secrets : **${totalAvecSecrets} point(s)**.`
                    : `📉 ${membre} perd **-${nombre} point(s)**.\nRaison : ${raison}\nTotal public : **${totalPublic} point(s)**.`
            );
            return;
        }
        if (subcommand === "voir") {
            const membre = interaction.options.getUser("membre") ?? interaction.user;
            const inclureSecrets = interaction.options.getBoolean("inclure_secrets") ?? false;
            if (inclureSecrets && !isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut voir les points secrets.");
                return;
            }
            const total = getUserTotalPoints({ guildId: interaction.guildId, userId: membre.id, includeSecret: inclureSecrets });
            await interaction.reply({
                content: `📊 ${membre} a **${total} point(s)**${inclureSecrets ? " (secrets inclus)" : ""}.`,
                flags: inclureSecrets ? MessageFlags.Ephemeral : undefined
            });
            return;
        }
        if (subcommand === "classement") {
            const inclureSecrets = interaction.options.getBoolean("inclure_secrets") ?? false;
            if (inclureSecrets && !isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut voir le classement avec les points secrets.");
                return;
            }
            const leaderboard = getLeaderboard({ guildId: interaction.guildId, includeSecret: inclureSecrets, limit: 10 });
            if (leaderboard.length === 0) {
                await interaction.reply("📊 Aucun point n’a encore été attribué.");
                return;
            }
            const lines = leaderboard.map((row, index) => `**${index + 1}.** <@${row.user_id}> — **${row.total} point(s)**`);
            await interaction.reply({
                content: `🏆 **Classement BDL**${inclureSecrets ? " (secrets inclus)" : ""}\n\n${lines.join("\n")}`,
                flags: inclureSecrets ? MessageFlags.Ephemeral : undefined
            });
            return;
        }
        if (subcommand === "historique") {
            const membre = interaction.options.getUser("membre") ?? interaction.user;
            const inclureSecrets = interaction.options.getBoolean("secrets") ?? false;
            if (inclureSecrets && !isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut voir l’historique avec les points secrets.");
                return;
            }
            const history = getUserPointsHistory({ guildId: interaction.guildId, userId: membre.id, includeSecret: inclureSecrets, limit: 15 });
            const total = getUserTotalPoints({ guildId: interaction.guildId, userId: membre.id, includeSecret: inclureSecrets });
            if (history.length === 0) {
                await interaction.reply({
                    content: `📭 Aucun point trouvé pour ${membre}.`,
                    flags: inclureSecrets ? MessageFlags.Ephemeral : undefined
                });
                return;
            }
            const lines = history.map(point => {
                const secretLabel = point.is_secret === 1 ? " 🕵️" : "";
                return `**${point.amount > 0 ? "+" : ""}${point.amount}**${secretLabel} — ${point.created_at}\n> ${truncate(point.reason, 180)}`;
            });
            const embed = new EmbedBuilder()
                .setTitle(`📜 Historique des points — ${membre.username}`)
                .setDescription(`Total : **${total} point(s)**${inclureSecrets ? " (secrets inclus)" : ""}`)
                .addFields({ name: "Dernières entrées", value: truncate(lines.join("\n\n"), 3500) })
                .setFooter({ text: "Historique limité aux 15 dernières entrées." })
                .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: inclureSecrets ? MessageFlags.Ephemeral : undefined });
            return;
        }
    }
    // ===== RUMEURS =====
    if (interaction.commandName === "rumeur") {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "proposer") {
            const texte = interaction.options.getString("texte");
            const cible = interaction.options.getUser("cible");
            const anonyme = interaction.options.getBoolean("anonyme") ?? false;
            const rumorId = addRumor({
                guildId: interaction.guildId,
                authorId: interaction.user.id,
                content: texte,
                targetUserId: cible?.id,
                anonymous: anonyme
            });
            const staffChannelId = getSetting({ guildId: interaction.guildId, key: "rumors_staff_channel_id" });
            if (staffChannelId) {
                const staffChannel = await interaction.guild.channels.fetch(staffChannelId).catch(() => null);
                if (staffChannel?.isTextBased()) {
                    const embed = new EmbedBuilder()
                        .setTitle("💬 Nouvelle rumeur proposée")
                        .setDescription(truncate(texte, 1000))
                        .addFields(
                            { name: "ID", value: `#${rumorId}`, inline: true },
                            { name: "Auteur", value: anonyme ? `${interaction.user} (anonyme)` : `${interaction.user}`, inline: false },
                            { name: "Cible", value: cible ? `${cible}` : "Aucune", inline: false },
                            { name: "Statut", value: "En attente", inline: true }
                        )
                        .setFooter({ text: "Clique sur un bouton ou utilise /rumeur approuver/refuser." })
                        .setTimestamp();
                    await staffChannel.send({ embeds: [embed], components: [createRumorButtons(rumorId)] });
                }
            }
            await interaction.reply({
                content: `✅ Ta rumeur a été envoyée au staff ! (ID: #${rumorId})`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        if (subcommand === "liste") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut lister les rumeurs.");
                return;
            }
            const status = interaction.options.getString("statut") ?? "pending";
            const rumors = getRumorsByStatus({ guildId: interaction.guildId, status, limit: 10 });
            if (rumors.length === 0) {
                await interaction.reply({ content: `📭 Aucune rumeur en statut **${status}**.`, flags: MessageFlags.Ephemeral });
                return;
            }
            const lines = rumors.map(r => `**#${r.id}** — ${truncate(r.content, 100)}\nAuteur: ${r.anonymous ? "Anonyme" : `<@${r.author_id}>`} | Statut: ${r.status}`);
            await interaction.reply({ content: `📜 **Rumeurs (${status})**\n\n${lines.join("\n\n")}`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (subcommand === "approuver") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut approuver les rumeurs.");
                return;
            }
            const rumorId = interaction.options.getInteger("id");
            const result = updateRumorStatus({
                guildId: interaction.guildId,
                rumorId,
                status: "approved",
                reviewedBy: interaction.user.id
            });
            if (result === 0) {
                await replyError(interaction, `Rumeur #${rumorId} introuvable.`);
                return;
            }
            await interaction.reply({ content: `✅ Rumeur #${rumorId} **approuvée**.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (subcommand === "refuser") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut refuser les rumeurs.");
                return;
            }
            const rumorId = interaction.options.getInteger("id");
            const raison = interaction.options.getString("raison") ?? "Aucune raison";
            const result = updateRumorStatus({
                guildId: interaction.guildId,
                rumorId,
                status: "rejected",
                reviewedBy: interaction.user.id,
                reviewReason: raison
            });
            if (result === 0) {
                await replyError(interaction, `Rumeur #${rumorId} introuvable.`);
                return;
            }
            await interaction.reply({ content: `❌ Rumeur #${rumorId} **refusée**. Raison: ${raison}`, flags: MessageFlags.Ephemeral });
            return;
        }
    }
    // ===== GAZETTE =====
    if (interaction.commandName === "gazette") {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "brouillon") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut générer un brouillon.");
                return;
            }
            const leaderboard = getLeaderboard({ guildId: interaction.guildId, includeSecret: false, limit: 5 });
            const approvedRumors = getRumorsByStatus({ guildId: interaction.guildId, status: "approved", limit: 3 });
            const approvedQuests = getQuestSubmissionsByStatus({ guildId: interaction.guildId, status: "approved", limit: 5 });
            const pendingRumors = getPendingRumorCount();
            const pendingQuests = getPendingQuestSubmissionCount();
            const topMember = leaderboard[0] || { user_id: "Aucun", total: 0 };
            const pointsBannerUrl = getPointsBannerUrl(topMember.total);
            const embed = new EmbedBuilder()
                .setTitle("📰 **Brouillon de Gazette BDL**")
                .setDescription("Base automatique pour la Gazette de cette semaine.")
                .setColor(0x9b59b6)
                .setImage(pointsBannerUrl)
                .addFields(
                    { name: "🏆 Membre de la semaine", value: `<@${topMember.user_id}> — **${topMember.total} points**`, inline: false },
                    { name: "📜 Rumeurs approuvées", value: approvedRumors.length > 0 ? approvedRumors.map(r => `• ${truncate(r.content, 150)}`).join("\n") : "Aucune", inline: false },
                    { name: "🗺️ Quêtes validées", value: approvedQuests.length > 0 ? approvedQuests.map(q => `• **${q.quest_title}** par <@${q.user_id}>`).join("\n") : "Aucune", inline: false },
                    { name: "📊 Statistiques", value: `Rumeurs en attente: **${pendingRumors}**\nQuêtes en attente: **${pendingQuests}**`, inline: true }
                )
                .setFooter({ text: "Utilise /gazette publier pour finaliser." })
                .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }
        if (subcommand === "publier") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut publier la Gazette.");
                return;
            }
            const titre = interaction.options.getString("titre");
            const pepites = formatMultilineInput(interaction.options.getString("pepites") || "");
            const stats = formatMultilineInput(interaction.options.getString("stats") || "");
            const rumeur = formatMultilineInput(interaction.options.getString("rumeur") || "");
            const exploit = formatMultilineInput(interaction.options.getString("exploit") || "");
            const nominations = formatMultilineInput(interaction.options.getString("nominations") || "");
            const banniere = interaction.options.getAttachment("banniere");
            const imagePepites = interaction.options.getAttachment("image_pepites");
            const imageStats = interaction.options.getAttachment("image_stats");
            const imageRumeur = interaction.options.getAttachment("image_rumeur");
            const imageExploit = interaction.options.getAttachment("image_exploit");
            const imageNominations = interaction.options.getAttachment("image_nominations");
            const gazetteChannelId = getSetting({ guildId: interaction.guildId, key: "gazette_channel_id" });
            if (!gazetteChannelId) {
                await replyError(interaction, "Aucun salon Gazette configuré. Utilise `/config salon`.");
                return;
            }
            const channel = await interaction.guild.channels.fetch(gazetteChannelId).catch(() => null);
            if (!channel?.isTextBased()) {
                await replyError(interaction, "Salon Gazette introuvable.");
                return;
            }
            const leaderboard = getLeaderboard({ guildId: interaction.guildId, includeSecret: false, limit: 3 });
            const pointsBannerUrl = getPointsBannerUrl(leaderboard[0]?.total || 0);
            const embeds = [];
            // 1. PREMIER EMBED : Titre + bannière (TOUJOURS en premier)
            const mainEmbed = new EmbedBuilder()
                .setTitle(`📰 **${titre}**`)
                .setDescription(
                    `**Édition du ${new Date().toLocaleDateString("fr-FR", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric"
                    })}**\n*La Gazette BDL.*`
                )
                .setColor(0x9b59b6)
                .setImage(banniere ? banniere.url : pointsBannerUrl)
                .setFooter({ text: "Une édition signée BDL Staff" })
                .setTimestamp();
            embeds.push(mainEmbed);
            // 2. Embed Pépites
            if (pepites.trim()) {
                const embed = new EmbedBuilder()
                    .setTitle("💎 Pépites de la semaine")
                    .setDescription(pepites)
                    .setColor(0x9b59b6);
                if (imagePepites) embed.setImage(imagePepites.url);
                embeds.push(embed);
            }
            // 3. Embed Stats
            if (stats.trim()) {
                const embed = new EmbedBuilder()
                    .setTitle("📊 Statistiques absurdes")
                    .setDescription(stats)
                    .setColor(0x9b59b6);
                if (imageStats) embed.setImage(imageStats.url);
                embeds.push(embed);
            }
            // 4. Embed Rumeur
            if (rumeur.trim()) {
                const embed = new EmbedBuilder()
                    .setTitle("🗞️ Rumeur de la semaine")
                    .setDescription(rumeur)
                    .setColor(0x9b59b6);
                if (imageRumeur) embed.setImage(imageRumeur.url);
                embeds.push(embed);
            }
            // 5. Embed Exploit
            if (exploit.trim()) {
                const embed = new EmbedBuilder()
                    .setTitle("🏆 Exploit de la semaine")
                    .setDescription(exploit)
                    .setColor(0x9b59b6);
                if (imageExploit) embed.setImage(imageExploit.url);
                embeds.push(embed);
            }
            // 6. Embed Nominations
            if (nominations.trim()) {
                const embed = new EmbedBuilder()
                    .setTitle("🎖️ Nominations")
                    .setDescription(nominations)
                    .setColor(0x9b59b6);
                if (imageNominations) embed.setImage(imageNominations.url);
                embeds.push(embed);
            }
            // 7. Embed Classement (TOUJOURS affiché)
            const classementEmbed = new EmbedBuilder()
                .setTitle("👑 Classement Points BDL")
                .setDescription(
                    leaderboard.length > 0
                        ? leaderboard.map((r, i) => `**${i + 1}.** <@${r.user_id}> — **${r.total} points**`).join("\n")
                        : "Aucun"
                )
                .setColor(0x9b59b6);
            embeds.push(classementEmbed);
            await channel.send({ embeds: embeds });
            await interaction.reply({ content: `✅ Gazette publiée dans ${channel} !`, flags: MessageFlags.Ephemeral });
            return;
        }
    }
    // ===== CONFIG =====
    if (interaction.commandName === "config") {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "salon") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut configurer les salons.");
                return;
            }
            const type = interaction.options.getString("type");
            const salon = interaction.options.getChannel("salon");
            setSetting({ guildId: interaction.guildId, key: type, value: salon.id });
            await interaction.reply({ content: `✅ Salon **${salon.name}** configuré pour **${type}**.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (subcommand === "role_staff") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut configurer le rôle staff.");
                return;
            }
            const role = interaction.options.getRole("role");
            setSetting({ guildId: interaction.guildId, key: "staff_role_id", value: role.id });
            await interaction.reply({ content: `✅ Rôle **${role.name}** configuré comme rôle staff.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (subcommand === "role_bump") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut configurer le rôle bump.");
                return;
            }
            const role = interaction.options.getRole("role");
            setSetting({ guildId: interaction.guildId, key: "bump_role_id", value: role.id });
            await interaction.reply({ content: `✅ Rôle **${role.name}** configuré pour les rappels de bump.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (subcommand === "role_mini_maitre") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut configurer le rôle Mini Maître.");
                return;
            }
            const role = interaction.options.getRole("role");
            setSetting({ guildId: interaction.guildId, key: "mini_master_role_id", value: role.id });
            await interaction.reply({ content: `✅ Rôle **${role.name}** configuré comme rôle Mini Maître.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (subcommand === "voir") {
            const settings = getAllSettings({ guildId: interaction.guildId });
            if (settings.length === 0) {
                await interaction.reply({ content: "⚠️ Aucune configuration enregistrée.", flags: MessageFlags.Ephemeral });
                return;
            }
            const lines = settings.map(s => `**${s.key}** : ${s.value}`);
            await interaction.reply({ content: `📋 **Configuration BDL**\n\n${lines.join("\n")}`, flags: MessageFlags.Ephemeral });
            return;
        }
    }
    // ===== QUÊTES =====
    if (interaction.commandName === "quete") {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "publier") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut publier des quêtes.");
                return;
            }
            const titre = interaction.options.getString("titre");
            const description = formatMultilineInput(interaction.options.getString("description"));
            const points = interaction.options.getInteger("points") ?? 1;
            const role = interaction.options.getRole("role");
            const joursRole = interaction.options.getInteger("jours_role") ?? 7;
            const image = interaction.options.getAttachment("image");
            const questId = addQuest({
                guildId: interaction.guildId,
                title: titre,
                description,
                rewardPoints: points,
                rewardRoleId: role?.id,
                rewardRoleDays: joursRole,
                createdBy: interaction.user.id
            });
            const questsChannelId = getSetting({ guildId: interaction.guildId, key: "quests_channel_id" });
            if (questsChannelId) {
                const channel = await interaction.guild.channels.fetch(questsChannelId).catch(() => null);
                if (channel?.isTextBased()) {
                    const embed = new EmbedBuilder()
                        .setTitle(`🗺️ **Nouvelle quête : ${titre}**`)
                        .setDescription(description)
                        .setColor(0x3498db)
                        .addFields(
                            { name: "🎯 Récompense", value: `**${points} point(s)**` + (role ? ` + rôle **${role.name}** (${joursRole} jours)` : ""), inline: true },
                            { name: "📌 ID", value: `#${questId}`, inline: true }
                        )
                        .setFooter({ text: "Utilise /quete valider pour soumettre ta preuve." })
                        .setTimestamp();
                    applyAttachmentImage(embed, image);
                    await channel.send({ embeds: [embed] });
                }
            }
            await interaction.reply({ content: `✅ Quête **${titre}** publiée ! (ID: #${questId})`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (subcommand === "liste") {
            const quests = getActiveQuests({ guildId: interaction.guildId, limit: 10 });
            if (quests.length === 0) {
                await interaction.reply("📭 Aucune quête active.");
                return;
            }
            const lines = quests.map(q => `**#${q.id} — ${q.title}**\n${truncate(q.description, 100)}\nRécompense: **${q.reward_points} pts**${q.reward_role_id ? " + rôle" : ""}`);
            await interaction.reply(`🗺️ **Quêtes actives**\n\n${lines.join("\n\n")}`);
            return;
        }
        if (subcommand === "valider") {
            const questId = interaction.options.getInteger("id");
            const preuve = formatMultilineInput(interaction.options.getString("preuve"));
            const photo = interaction.options.getAttachment("photo");
            const membreMentionne = interaction.options.getUser("membre_mentionne");
            const lien = interaction.options.getString("lien") ?? null;
            const quest = getQuestById({ guildId: interaction.guildId, questId });
            if (!quest) {
                await replyError(interaction, `Quête #${questId} introuvable.`);
                return;
            }
            if (quest.status !== "active") {
                await replyError(interaction, `La quête **${quest.title}** n’est plus active.`);
                return;
            }
            try {
                addQuestSubmission({
                    guildId: interaction.guildId,
                    questId,
                    userId: interaction.user.id,
                    proof: preuve,
                    proofImageUrl: photo?.url,
                    mentionedUserId: membreMentionne?.id,
                    proofLink: lien
                });
                const allSubmissions = getQuestSubmissionsByStatus({
                    guildId: interaction.guildId,
                    status: "pending",
                    limit: 50
                }) || [];
                const submission = allSubmissions
                    .filter(s => s.user_id === interaction.user.id && s.quest_id === questId)
                    .sort((a, b) => b.id - a.id)[0];
                if (!submission) {
                    await replyError(interaction, "Impossible de récupérer l'ID de la soumission.");
                    return;
                }
                const staffChannelId = getSetting({ guildId: interaction.guildId, key: "rumors_staff_channel_id" });
                if (staffChannelId) {
                    const staffChannel = await interaction.guild.channels.fetch(staffChannelId).catch(() => null);
                    if (staffChannel?.isTextBased()) {
                        const embed = new EmbedBuilder()
                            .setTitle("🗺️ Nouvelle validation de quête")
                            .setDescription(truncate(preuve, 1000))
                            .addFields(
                                { name: "ID", value: `#${submission.id}`, inline: true },
                                { name: "Quête", value: `**${quest.title}** (ID: #${questId})`, inline: false },
                                { name: "Auteur", value: `${interaction.user}`, inline: true },
                                { name: "Membre mentionné", value: membreMentionne ? `${membreMentionne}` : "Aucun", inline: true },
                                { name: "Lien", value: lien || "Aucun", inline: false },
                                { name: "Statut", value: "En attente", inline: true }
                            )
                            .setFooter({ text: "Clique sur un bouton ou utilise /quete approuver/refuser" })
                            .setTimestamp();
                        if (photo) embed.setImage(photo.url);
                        await staffChannel.send({
                            embeds: [embed],
                            components: [createQuestSubmissionButtons(submission.id)]
                        }).catch(console.error);
                    }
                }
                await interaction.reply({
                    content: `✅ Ta validation pour **${quest.title}** a été envoyée au staff ! (ID: #${submission.id})`,
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                await replyError(interaction, "Tu as déjà soumis une validation pour cette quête.");
            }
            return;
        }
        if (subcommand === "submissions") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut voir les validations.");
                return;
            }
            const status = interaction.options.getString("statut") ?? "pending";
            const submissions = getQuestSubmissionsByStatus({ guildId: interaction.guildId, status, limit: 10 });
            if (submissions.length === 0) {
                await interaction.reply({ content: `📭 Aucune validation en statut **${status}**.`, flags: MessageFlags.Ephemeral });
                return;
            }
            const lines = submissions.map(s => `**#${s.id}** — **${s.quest_title}** par <@${s.user_id}>\nPreuve: ${truncate(s.proof, 80)}`);
            await interaction.reply({ content: `📜 **Validations (${status})**\n\n${lines.join("\n\n")}`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (subcommand === "approuver") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut approuver les validations.");
                return;
            }
            const submissionId = interaction.options.getInteger("id");
            const submission = getQuestSubmissionById({ guildId: interaction.guildId, submissionId });
            if (!submission) {
                await replyError(interaction, `Validation #${submissionId} introuvable.`);
                return;
            }
            updateQuestSubmissionStatus({
                guildId: interaction.guildId,
                submissionId,
                status: "approved",
                reviewedBy: interaction.user.id
            });
            addPoints({
                guildId: interaction.guildId,
                userId: submission.user_id,
                amount: submission.reward_points,
                reason: `Quête validée : ${submission.quest_title}`,
                isSecret: false,
                createdBy: interaction.user.id
            });
            if (submission.reward_role_id) {
                const member = await interaction.guild.members.fetch(submission.user_id).catch(() => null);
                if (!member) {
                    await interaction.followUp({ content: "⚠️ Le membre a quitté le serveur. Les points ont été attribués, mais pas le rôle.", flags: MessageFlags.Ephemeral }).catch(() => null);
                } else {
                    const expiresAt = addDays(new Date(), submission.reward_role_days ?? 7);
                    await member.roles.add(submission.reward_role_id, `Rôle temporaire : ${submission.quest_title}`).catch(console.error);
                    addTemporaryRole({
                        guildId: interaction.guildId,
                        userId: submission.user_id,
                        roleId: submission.reward_role_id,
                        reason: `Quête validée : ${submission.quest_title}`,
                        expiresAt: formatDateForDatabase(expiresAt),
                        createdBy: interaction.user.id
                    });
                }
            }
            await interaction.reply({ content: `✅ Validation #${submissionId} **approuvée**. Points et rôle attribués.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (subcommand === "refuser") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut refuser les validations.");
                return;
            }
            const submissionId = interaction.options.getInteger("id");
            const raison = interaction.options.getString("raison") ?? "Aucune raison";
            const result = updateQuestSubmissionStatus({
                guildId: interaction.guildId,
                submissionId,
                status: "rejected",
                reviewedBy: interaction.user.id,
                reviewReason: raison
            });
            if (result === 0) {
                await replyError(interaction, `Validation #${submissionId} introuvable.`);
                return;
            }
            await interaction.reply({ content: `❌ Validation #${submissionId} **refusée**. Raison: ${raison}`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (subcommand === "fermer") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut fermer les quêtes.");
                return;
            }
            const questId = interaction.options.getInteger("id");
            const result = closeQuest({ guildId: interaction.guildId, questId });
            if (result === 0) {
                await replyError(interaction, `Quête #${questId} introuvable.`);
                return;
            }
            await interaction.reply({ content: `✅ Quête #${questId} **fermée**.`, flags: MessageFlags.Ephemeral });
            return;
        }
    }
    // ===== RÔLES TEMPORAIRES =====
    if (interaction.commandName === "role") {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "temporaire") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut donner des rôles temporaires.");
                return;
            }
            const membre = interaction.options.getUser("membre");
            const role = interaction.options.getRole("role");
            const jours = interaction.options.getInteger("jours");
            const raison = interaction.options.getString("raison") ?? "Aucune raison";
            const member = await interaction.guild.members.fetch(membre.id).catch(() => null);
            if (!member) {
                await replyError(interaction, "Membre introuvable.");
                return;
            }
            await member.roles.add(role.id, `Rôle temporaire : ${raison}`).catch(async () => {
                await replyError(interaction, "Impossible d'ajouter le rôle. Vérifie les permissions du bot.");
            });
            const expiresAt = addDays(new Date(), jours);
            addTemporaryRole({
                guildId: interaction.guildId,
                userId: membre.id,
                roleId: role.id,
                reason: raison,
                expiresAt: formatDateForDatabase(expiresAt),
                createdBy: interaction.user.id
            });
            await interaction.reply({
                content: `✅ Rôle **${role.name}** donné à ${membre} pour **${jours} jour(s)**.\nRaison: ${raison}`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        if (subcommand === "liste") {
            const tempRoles = getActiveTemporaryRoles({ guildId: interaction.guildId, limit: 20 });
            if (tempRoles.length === 0) {
                await interaction.reply("📭 Aucun rôle temporaire actif.");
                return;
            }
            const lines = tempRoles.map(tr => {
                const expiresAt = new Date(tr.expires_at);
                const daysLeft = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
                return `**<@${tr.user_id}>** — **${tr.role_id}**\nExpire dans **${daysLeft} jour(s)** | Raison: ${tr.reason}`;
            });
            await interaction.reply(`🎭 **Rôles temporaires actifs**\n\n${lines.join("\n\n")}`);
            return;
        }
    }
    // ===== MEMBRE MYSTÈRE =====
    if (interaction.commandName === "mystere") {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "set") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut définir le Membre Mystère.");
                return;
            }
            const membre = interaction.options.getUser("membre");
            const semaine = interaction.options.getString("semaine") ?? getWeekKey();
            const image = interaction.options.getAttachment("image");
            const gameId = createMysteryGame({
                guildId: interaction.guildId,
                targetUserId: membre.id,
                weekKey: semaine,
                createdBy: interaction.user.id
            });
            const mysteryChannelId = getSetting({ guildId: interaction.guildId, key: "mystery_channel_id" });
            if (mysteryChannelId) {
                const channel = await interaction.guild.channels.fetch(mysteryChannelId).catch(() => null);
                if (channel?.isTextBased()) {
                    const embed = new EmbedBuilder()
                        .setTitle(`🕵️ **Membre Mystère — ${semaine}**`)
                        .setDescription("Un membre a été choisi secrètement. À toi de deviner qui c'est !\nUtilise `/mystere guess` pour proposer une réponse.")
                        .setColor(0xf39c12)
                        .setTimestamp();
                    applyAttachmentImage(embed, image);
                    await channel.send({ embeds: [embed] });
                }
            }
            await interaction.reply({ content: `✅ Membre Mystère défini: **${membre}** (semaine: ${semaine}, ID: #${gameId}).`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (subcommand === "indice") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut ajouter des indices.");
                return;
            }
            const game = getActiveMysteryGame({ guildId: interaction.guildId });
            if (!game) {
                await replyError(interaction, "Aucune partie active. Utilise `/mystere set`.");
                return;
            }
            const numero = interaction.options.getInteger("numero");
            const texte = formatMultilineInput(interaction.options.getString("texte"));
            const publier = interaction.options.getBoolean("publier") ?? false;
            addMysteryHint({ guildId: interaction.guildId, gameId: game.id, hintNumber: numero, content: texte });
            if (publier) {
                markMysteryHintPublished({ guildId: interaction.guildId, gameId: game.id, hintNumber: numero });
                const mysteryChannelId = getSetting({ guildId: interaction.guildId, key: "mystery_channel_id" });
                if (mysteryChannelId) {
                    const channel = await interaction.guild.channels.fetch(mysteryChannelId).catch(() => null);
                    if (channel?.isTextBased()) {
                        const embed = new EmbedBuilder()
                            .setTitle(`🕵️ Indice #${numero}`)
                            .setDescription(texte)
                            .setFooter({ text: "Fais tes propositions avec /mystere guess" })
                            .setTimestamp();
                        await channel.send({ embeds: [embed] });
                    }
                }
            }
            await interaction.reply({ content: `✅ Indice #${numero} ${publier ? "publié" : "enregistré"}.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (subcommand === "guess") {
            const game = getActiveMysteryGame({ guildId: interaction.guildId });
            if (!game) {
                await replyError(interaction, "Aucune partie active.");
                return;
            }
            if (hasMysteryGuessToday({ guildId: interaction.guildId, gameId: game.id, userId: interaction.user.id })) {
                await replyError(interaction, "Tu as déjà fait une proposition aujourd’hui. Reviens demain !");
                return;
            }
            const membre = interaction.options.getUser("membre");
            const isCorrect = membre.id === game.target_user_id;
            addMysteryGuess({
                guildId: interaction.guildId,
                gameId: game.id,
                userId: interaction.user.id,
                guessedUserId: membre.id,
                isCorrect
            });
            await interaction.reply({
                content: isCorrect
                    ? `🎉 **Bravo !** Tu as trouvé le Membre Mystère: **${membre}** ! Attends la révélation officielle.`
                    : `❌ Ce n’est pas **${membre}**... Réessaye demain !`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        if (subcommand === "reveal") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut révéler le Membre Mystère.");
                return;
            }
            const game = getActiveMysteryGame({ guildId: interaction.guildId });
            if (!game) {
                await replyError(interaction, "Aucune partie active.");
                return;
            }
            const firstCorrectGuess = getFirstCorrectMysteryGuess({ guildId: interaction.guildId, gameId: game.id });
            revealMysteryGame({ guildId: interaction.guildId, gameId: game.id, winnerUserId: firstCorrectGuess?.user_id });
            const mysteryChannelId = getSetting({ guildId: interaction.guildId, key: "mystery_channel_id" });
            if (mysteryChannelId) {
                const channel = await interaction.guild.channels.fetch(mysteryChannelId).catch(() => null);
                if (channel?.isTextBased()) {
                    let description = `🎉 **Le Membre Mystère était... <@${game.target_user_id}> !**\n\n`;
                    if (firstCorrectGuess) {
                        const winnerPoints = 5;
                        addPoints({
                            guildId: interaction.guildId,
                            userId: firstCorrectGuess.user_id,
                            amount: winnerPoints,
                            reason: `Membre Mystère trouvé (semaine ${game.week_key})`,
                            isSecret: false,
                            createdBy: interaction.client.user.id
                        });
                        description += `🏆 **<@${firstCorrectGuess.user_id}>** a trouvé en premier et gagne **+${winnerPoints} points** !`;
                    } else {
                        description += "Personne n’a trouvé le bon membre...";
                    }
                    const embed = new EmbedBuilder()
                        .setTitle(`🕵️ **Révélation — ${game.week_key}**`)
                        .setDescription(description)
                        .setColor(0x2ecc71)
                        .setTimestamp();
                    await channel.send({ embeds: [embed] });
                }
            }
            await interaction.reply({ content: `✅ Membre Mystère révélé: **<@${game.target_user_id}>** !`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (subcommand === "statut") {
            const game = getActiveMysteryGame({ guildId: interaction.guildId });
            if (!game) {
                await replyError(interaction, "Aucune partie active. Utilise `/mystere set`.");
                return;
            }
            const hints = getMysteryHints({ guildId: interaction.guildId, gameId: game.id });
            const publishedHints = hints.filter(h => h.published === 1).length;
            const unpublishedHints = hints.filter(h => h.published === 0).length;
            const guesses = getTopCorrectMysteryGuessers({ guildId: interaction.guildId, gameId: game.id, limit: 3 });
            const embed = new EmbedBuilder()
                .setTitle(`🕵️ **Membre Mystère — ${game.week_key}**`)
                .setDescription(
                    `Partie active depuis le ${new Date(game.created_at).toLocaleDateString("fr-FR")}\n` +
                    `Indices: **${publishedHints} publiés**, **${unpublishedHints} en attente**\n` +
                    `Bonne(s) réponse(s): ${guesses.length > 0 ? guesses.map(g => `<@${g.user_id}>`).join(", ") : "Aucune"}`
                )
                .setColor(0xf39c12)
                .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }
    }
    // ===== DROP EVENTS =====
    if (interaction.commandName === "drop") {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "lancer") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut lancer un Drop Event.");
                return;
            }
            const titre = interaction.options.getString("titre") ?? "Drop Event BDL";
            const gagnants = interaction.options.getInteger("gagnants") ?? 5;
            const points = interaction.options.getInteger("points") ?? 1;
            const image = interaction.options.getAttachment("image");
            const dropId = createDropEvent({
                guildId: interaction.guildId,
                channelId: interaction.channelId,
                title: titre,
                rewardPoints: points,
                maxWinners: gagnants,
                createdBy: interaction.user.id
            });
            const embed = new EmbedBuilder()
                .setTitle(`🎁 **${titre}**`)
                .setDescription(`Les **${gagnants} premiers** à cliquer gagnent **+${points} point(s)** !\n⚠️ **Un seul clic par personne !**`)
                .setColor(0xe74c3c)
                .setTimestamp();
            applyAttachmentImage(embed, image);
            const message = await interaction.reply({ embeds: [embed], components: [createDropButton(dropId)], fetchReply: true });
            setDropMessageId({ guildId: interaction.guildId, dropId, messageId: message.id });
            return;
        }
    }
    // ===== MINI MAÎTRE =====
    if (interaction.commandName === "grandmaitre") {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "classement") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut voir le classement Mini Maître.");
                return;
            }
            const mois = interaction.options.getInteger("mois") ?? new Date().getMonth() + 1;
            const annee = interaction.options.getInteger("annee") ?? new Date().getFullYear();
            const leaderboard = getMonthlyLeaderboard({ guildId: interaction.guildId, year: annee, month: mois, includeSecret: true, limit: 10 });
            if (leaderboard.length === 0) {
                await interaction.reply({
                    content: `📊 Aucun point pour **${new Date(annee, mois - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}**.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            const lines = leaderboard.map((r, i) => `**${i + 1}.** <@${r.user_id}> — **${r.total} points** (secrets inclus)`);
            await interaction.reply({
                content: `🏆 **Classement Mini Maître — ${new Date(annee, mois - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}** (secrets inclus)\n\n${lines.join("\n")}`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        if (subcommand === "couronner") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut couronner le Mini Maître.");
                return;
            }
            const mois = interaction.options.getInteger("mois") ?? new Date().getMonth() + 1;
            const annee = interaction.options.getInteger("annee") ?? new Date().getFullYear();
            const leaderboard = getMonthlyLeaderboard({ guildId: interaction.guildId, year: annee, month: mois, includeSecret: true, limit: 1 });
            if (leaderboard.length === 0) {
                await replyError(interaction, `Aucun point pour ${new Date(annee, mois - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}.`);
                return;
            }
            const miniMasterRoleId = getSetting({ guildId: interaction.guildId, key: "mini_master_role_id" });
            if (!miniMasterRoleId) {
                await replyError(interaction, "Aucun rôle Mini Maître configuré. Utilise `/config role_mini_maitre`.");
                return;
            }
            const member = await interaction.guild.members.fetch(leaderboard[0].user_id).catch(() => null);
            if (!member) {
                await replyError(interaction, "Membre introuvable.");
                return;
            }
            await member.roles.add(miniMasterRoleId, `Mini Maître — ${new Date(annee, mois - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`).catch(async () => {
                await replyError(interaction, "Impossible de donner le rôle. Vérifie les permissions du bot.");
            });
            await interaction.reply({
                content: `👑 **<@${leaderboard[0].user_id}>** est couronné **Mini Maître** pour **${new Date(annee, mois - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}** ! (Total: **${leaderboard[0].total} points** avec secrets)`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }
    // ===== PROFIL =====
    if (interaction.commandName === "profil") {
        const membre = interaction.options.getUser("membre") ?? interaction.user;
        const secrets = interaction.options.getBoolean("secrets") ?? false;
        if (secrets && !isStaff(interaction.member)) {
            await replyError(interaction, "Seul le staff peut voir les points secrets.");
            return;
        }
        const totalPoints = getUserTotalPoints({ guildId: interaction.guildId, userId: membre.id, includeSecret: secrets });
        const approvedRumors = getUserApprovedRumorCount({ guildId: interaction.guildId, userId: membre.id });
        const approvedQuests = getUserApprovedQuestCount({ guildId: interaction.guildId, userId: membre.id });
        const rank = getUserRank({ guildId: interaction.guildId, userId: membre.id, includeSecret: secrets });
        const bannerUrl = getPointsBannerUrl(totalPoints);
        const embed = new EmbedBuilder()
            .setTitle(`📜 Profil BDL — ${membre.username}`)
            .setDescription(`**Points** : **${totalPoints}**${secrets ? " (secrets inclus)" : ""}`)
            .setColor(0x3498db)
            .setImage(bannerUrl)
            .addFields(
                { name: "🏆 Classement", value: rank ? `#${rank.rank}` : "Non classé", inline: true },
                { name: "📜 Rumeurs approuvées", value: `**${approvedRumors}**`, inline: true },
                { name: "🗺️ Quêtes validées", value: `**${approvedQuests}**`, inline: true }
            )
            .setFooter({ text: "BDL Bot — /boutique pour acheter des récompenses" })
            .setTimestamp();
        await interaction.reply({ embeds: [embed] });
        return;
    }
    // ===== BOUTIQUE =====
    if (interaction.commandName === "boutique") {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "voir") {
            const embed = new EmbedBuilder()
                .setTitle("🛒 **Boutique de points BDL**")
                .setDescription("Achète des récompenses avec tes points !\n\n" + formatShopItemList())
                .setColor(0xf1c40f)
                .setFooter({ text: "Utilise /boutique acheter pour un achat" })
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
            return;
        }
        if (subcommand === "acheter") {
            const itemKey = interaction.options.getString("item");
            const note = interaction.options.getString("note") ?? null;
            const item = SHOP_ITEMS[itemKey];
            if (!item) {
                await replyError(interaction, "Objet introuvable.");
                return;
            }
            const userTotal = getUserTotalPoints({ guildId: interaction.guildId, userId: interaction.user.id, includeSecret: false });
            if (userTotal < item.price) {
                await replyError(interaction, `Tu n’as pas assez de points (prix: **${item.price}**, ton total: **${userTotal}**).`);
                return;
            }
            if (itemKey === "trophee_personnalise") {
                const existingPurchases = getShopPurchasesByStatus({ guildId: interaction.guildId, status: "approved" }) || [];
                if (existingPurchases.some(p => p.user_id === interaction.user.id && p.item_key === "trophee_personnalise")) {
                    await replyError(interaction, "Limite atteinte : 1 trophée max par personne.");
                    return;
                }
            }
            const purchaseId = addShopPurchase({
                guildId: interaction.guildId,
                userId: interaction.user.id,
                itemKey,
                itemName: item.name,
                price: item.price,
                note
            });
            const staffChannelId = getSetting({ guildId: interaction.guildId, key: "shop_staff_channel_id" });
            if (staffChannelId) {
                const staffChannel = await interaction.guild.channels.fetch(staffChannelId).catch(() => null);
                if (staffChannel?.isTextBased()) {
                    const embed = new EmbedBuilder()
                        .setTitle("🛒 Nouvelle demande d'achat")
                        .setDescription(`**${item.name}** — **${item.price} points**`)
                        .addFields(
                            { name: "ID", value: `#${purchaseId}`, inline: true },
                            { name: "Acheteur", value: `${interaction.user}`, inline: true },
                            { name: "Note", value: note || "Aucune", inline: false },
                            { name: "Statut", value: "En attente", inline: true }
                        )
                        .setFooter({ text: "Clique sur un bouton ou utilise /boutique approuver/refuser" })
                        .setTimestamp();
                    await staffChannel.send({ embeds: [embed], components: [createShopPurchaseButtons(purchaseId)] });
                }
            }
            await interaction.reply({
                content: `✅ Ta demande pour **${item.name}** (${item.price} points) a été envoyée au staff ! (ID: #${purchaseId})`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        if (subcommand === "demandes") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut voir les demandes.");
                return;
            }
            const status = interaction.options.getString("statut") ?? "pending";
            const purchases = getShopPurchasesByStatus({ guildId: interaction.guildId, status, limit: 10 }) || [];
            if (purchases.length === 0) {
                await interaction.reply({ content: `📭 Aucune demande en statut **${status}**.`, flags: MessageFlags.Ephemeral });
                return;
            }
            const lines = purchases.map(p => `**#${p.id}** — **${p.item_name}** par <@${p.user_id}>\nPrix: **${p.price} pts** | Statut: ${p.status}`);
            await interaction.reply({ content: `🛒 **Demandes (${status})**\n\n${lines.join("\n\n")}`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (subcommand === "approuver") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut approuver les achats.");
                return;
            }
            const purchaseId = interaction.options.getInteger("id");
            const purchase = getShopPurchaseById({ guildId: interaction.guildId, purchaseId });
            if (!purchase) {
                await replyError(interaction, `Demande #${purchaseId} introuvable.`);
                return;
            }
            if (purchase.status !== "pending") {
                await replyError(interaction, `Demande déjà traitée (statut: ${purchase.status}).`);
                return;
            }
            if (purchase.item_key === "trophee_personnalise") {
                const existingPurchases = getShopPurchasesByStatus({ guildId: interaction.guildId, status: "approved" }) || [];
                if (existingPurchases.some(p => p.user_id === purchase.user_id && p.item_key === "trophee_personnalise")) {
                    await replyError(interaction, "Limite atteinte : ce membre a déjà un trophée.");
                    return;
                }
            }
            const total = getUserTotalPoints({ guildId: interaction.guildId, userId: purchase.user_id, includeSecret: false });
            if (total < purchase.price) {
                await replyError(interaction, `<@${purchase.user_id}> n’a pas assez de points (prix: **${purchase.price}**, total: **${total}**).`);
                return;
            }
            addPoints({
                guildId: interaction.guildId,
                userId: purchase.user_id,
                amount: -purchase.price,
                reason: `Achat boutique : ${purchase.item_name}`,
                isSecret: false,
                createdBy: interaction.user.id
            });
            updateShopPurchaseStatus({
                guildId: interaction.guildId,
                purchaseId,
                status: "approved",
                reviewedBy: interaction.user.id,
                reviewReason: "Approuvé via commande"
            });
            await interaction.reply({
                content: `✅ Demande #${purchaseId} **approuvée**. **${purchase.price} points** retirés à <@${purchase.user_id}>.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        if (subcommand === "refuser") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut refuser les achats.");
                return;
            }
            const purchaseId = interaction.options.getInteger("id");
            const raison = interaction.options.getString("raison") ?? "Aucune raison";
            const result = updateShopPurchaseStatus({
                guildId: interaction.guildId,
                purchaseId,
                status: "rejected",
                reviewedBy: interaction.user.id,
                reviewReason: raison
            });
            if (result === 0) {
                await replyError(interaction, `Demande #${purchaseId} introuvable.`);
                return;
            }
            await interaction.reply({ content: `❌ Demande #${purchaseId} **refusée**. Raison: ${raison}`, flags: MessageFlags.Ephemeral });
            return;
        }
    }
    // ===== BACKUP =====
    if (interaction.commandName === "backup") {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "export") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut exporter la base.");
                return;
            }
            const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "data", "bdl.sqlite");
            const attachment = new AttachmentBuilder(dbPath, { name: "bdl_backup.sqlite" });
            await interaction.reply({ content: "💾 Base de données SQLite:", files: [attachment], flags: MessageFlags.Ephemeral });
            return;
        }
        if (subcommand === "info") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut voir les infos.");
                return;
            }
            const stats = getBackupStats();
            const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "data", "bdl.sqlite");
            const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
            const embed = new EmbedBuilder()
                .setTitle("🗃️ **Infos Base de Données**")
                .setColor(0x3498db)
                .addFields(
                    { name: "📊 Points", value: `${stats.points}`, inline: true },
                    { name: "💬 Rumeurs", value: `${stats.rumors}`, inline: true },
                    { name: "🗺️ Quêtes", value: `${stats.quests}`, inline: true },
                    { name: "✅ Validations", value: `${stats.questSubmissions}`, inline: true },
                    { name: "🎭 Rôles temporaires", value: `${stats.temporaryRoles}`, inline: true },
                    { name: "🕵️ Membre Mystère", value: `${stats.mysteryGames}`, inline: true },
                    { name: "💡 Indices", value: `${stats.mysteryHints}`, inline: true },
                    { name: "🎯 Réponses", value: `${stats.mysteryGuesses}`, inline: true },
                    { name: "🎁 Drop Events", value: `${stats.dropEvents}`, inline: true },
                    { name: "👥 Participants", value: `${stats.dropParticipants}`, inline: true },
                    { name: "🛒 Achats boutique", value: `${stats.shopPurchases}`, inline: true },
                    { name: "⚙️ Paramètres", value: `${stats.settings}`, inline: true },
                    { name: "💾 Taille base", value: formatFileSize(dbSize), inline: false },
                    { name: "🔄 Rôles actifs", value: `${getActiveTemporaryRoleCount()}`, inline: true },
                    { name: "⏳ Rumeurs en attente", value: `${getPendingRumorCount()}`, inline: true },
                    { name: "⏳ Quêtes en attente", value: `${getPendingQuestSubmissionCount()}`, inline: true }
                )
                .setTimestamp();
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }
    }
    // ===== ARCHIVE =====
    if (interaction.commandName === "archive") {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === "old_drops") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut nettoyer les données.");
                return;
            }
            const confirmer = interaction.options.getBoolean("confirmer");
            const jours = interaction.options.getInteger("jours") ?? 30;
            if (!confirmer) {
                await interaction.reply({
                    content: `⚠️ **Attention** : Cette commande supprimera les Drop Events **terminés depuis +${jours} jours**.\n\nUtilise \`/archive old_drops confirmer:true jours:${jours}\`.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            const result = deleteOldDropEvents({ beforeDate: getCleanupDate(jours) });
            await interaction.reply({
                content: `🗑️ **${result.events} Drop Events** et **${result.participants} participants** supprimés.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        if (subcommand === "old_rumors") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut nettoyer les données.");
                return;
            }
            const confirmer = interaction.options.getBoolean("confirmer");
            const jours = interaction.options.getInteger("jours") ?? 30;
            if (!confirmer) {
                await interaction.reply({
                    content: `⚠️ **Attention** : Supprimera les rumeurs **refusées depuis +${jours} jours**.\n\nUtilise \`/archive old_rumors confirmer:true jours:${jours}\`.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            const result = deleteOldRejectedRumors({ beforeDate: getCleanupDate(jours) });
            await interaction.reply({ content: `🗑️ **${result.rumors} rumeurs** supprimées.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (subcommand === "old_mysteries") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut nettoyer les données.");
                return;
            }
            const confirmer = interaction.options.getBoolean("confirmer");
            const jours = interaction.options.getInteger("jours") ?? 30;
            if (!confirmer) {
                await interaction.reply({
                    content: `⚠️ **Attention** : Supprimera les parties **terminées depuis +${jours} jours**.\n\nUtilise \`/archive old_mysteries confirmer:true jours:${jours}\`.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            const result = deleteOldMysteryGames({ beforeDate: getCleanupDate(jours) });
            await interaction.reply({
                content: `🗑️ **${result.games} parties**, **${result.hints} indices** et **${result.guesses} réponses** supprimés.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        if (subcommand === "old_temp_roles") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut nettoyer les données.");
                return;
            }
            const confirmer = interaction.options.getBoolean("confirmer");
            const jours = interaction.options.getInteger("jours") ?? 30;
            if (!confirmer) {
                await interaction.reply({
                    content: `⚠️ **Attention** : Supprimera les rôles **retirés depuis +${jours} jours**.\n\nUtilise \`/archive old_temp_roles confirmer:true jours:${jours}\`.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            const result = deleteOldRemovedTemporaryRoles({ beforeDate: getCleanupDate(jours) });
            await interaction.reply({ content: `🗑️ **${result.temporaryRoles} rôles** supprimés.`, flags: MessageFlags.Ephemeral });
            return;
        }
        if (subcommand === "vacuum") {
            if (!isStaff(interaction.member)) {
                await replyError(interaction, "Seul le staff peut optimiser la base.");
                return;
            }
            const confirmer = interaction.options.getBoolean("confirmer");
            if (!confirmer) {
                await interaction.reply({
                    content: "⚠️ **Attention** : Optimise le fichier SQLite.\nUtilise `/archive vacuum confirmer:true`.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            vacuumDatabase();
            await interaction.reply({ content: "✅ Base de données optimisée (VACUUM).", flags: MessageFlags.Ephemeral });
            return;
        }
        if (subcommand === "info") {
            await interaction.reply({
                content:
                    `🗑️ **Commandes d’archive**\n\n` +
                    `Nettoie les anciennes données pour éviter que la base ne devienne trop grosse.\n\n` +
                    `**Disponibles :**\n` +
                    `- /archive old_drops : Supprime les Drop Events terminés\n` +
                    `- /archive old_rumors : Supprime les rumeurs refusées\n` +
                    `- /archive old_mysteries : Supprime les parties Membre Mystère terminées\n` +
                    `- /archive old_temp_roles : Supprime l’historique des rôles temporaires\n` +
                    `- /archive vacuum : Optimise le fichier SQLite\n\n` +
                    `⚠️ **Toutes ces commandes nécessitent **confirmer:true** et sont réservées au staff.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }
}
/* =========================
   ÉCOUTEURS D'ÉVÉNEMENTS
========================= */
client.once(Events.ClientReady, (c) => {
    console.log(`✅ Bot connecté en tant que ${c.user.tag} (ID: ${c.user.id})`);
    // Nettoyage initial des rôles expirés
    cleanupExpiredTemporaryRoles(c).catch(console.error);
    // Tâches planifiées
    cron.schedule("*/10 * * * *", () => cleanupExpiredTemporaryRoles(c).catch(console.error));
    cron.schedule("0 18 * * 3,5", () => {
        c.guilds.cache.forEach(g => publishMysteryHint(c, g.id, 1).catch(console.error));
    });
    cron.schedule("0 19 * * 3,5", () => {
        c.guilds.cache.forEach(g => publishMysteryHint(c, g.id, 2).catch(console.error));
    });
    cron.schedule("0 20 * * 6", () => {
        c.guilds.cache.forEach(g => sendMysteryRevealReminder(c, g.id).catch(console.error));
    });
    cron.schedule("0 * * * *", () => {
        c.guilds.cache.forEach(g => checkScheduledBumpReminder(c, g.id).catch(console.error));
    });
});
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.guild) {
        await replyError(interaction, "Cette commande ne fonctionne que dans un serveur.");
        return;
    }
    if (interaction.isChatInputCommand()) {
        try {
            await handleCommandInteraction(interaction);
        } catch (error) {
            console.error("Erreur dans une commande slash :", error);
            await replyError(interaction, "Une erreur est survenue.");
        }
    } else if (interaction.isButton()) {
        try {
            await handleButtonInteraction(interaction);
        } catch (error) {
            console.error("Erreur dans un handler de bouton :", error);
            await replyError(interaction, "Une erreur est survenue.");
        }
    }
});
client.on(Events.MessageCreate, async (message) => {
    try {
        await handleDisboardBumpMessage(message);
    } catch (error) {
        console.error("Erreur dans le handler de message :", error);
    }
});
// Connexion du bot
client.login(process.env.DISCORD_TOKEN).catch(console.error);
