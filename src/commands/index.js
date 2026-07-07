// Charge les variables du fichier .env.
// Exemple : DISCORD_TOKEN, GUILD_ID, CLIENT_ID, GRAND_MASTER_ROLE_ID.
require("dotenv").config();

// Module Node natif pour manipuler les fichiers.
// Ici utilisé pour vérifier/exporter la base SQLite.
const fs = require("node:fs");

// Module Node natif pour créer des chemins de fichiers propres selon l'OS.
const path = require("node:path");

// Librairie qui permet de lancer des tâches automatiques selon un planning.
// Ici utilisée pour nettoyer les rôles temporaires et publier les indices Membre Mystère.
const cron = require("node-cron");

// Imports principaux de discord.js.
const {
    // Client = le bot Discord lui-même.
    Client,

    // GatewayIntentBits = les autorisations de lecture d'événements Discord.
    GatewayIntentBits,

    // Events = noms officiels des événements Discord, comme ClientReady ou InteractionCreate.
    Events,

    // PermissionFlagsBits = permet de vérifier les permissions Discord d'un membre.
    PermissionFlagsBits,

    // EmbedBuilder = permet de créer de jolis messages encadrés.
    EmbedBuilder,

    // MessageFlags = permet notamment de faire des réponses éphémères.
    MessageFlags,

    // ActionRowBuilder = ligne qui contient des boutons.
    ActionRowBuilder,

    // ButtonBuilder = permet de créer un bouton Discord.
    ButtonBuilder,

    // ButtonStyle = styles des boutons : Success, Danger, Primary, Secondary...
    ButtonStyle,

    // AttachmentBuilder = permet d'envoyer un fichier, utilisé pour /backup export.
    AttachmentBuilder
} = require("discord.js");

// Import de toutes les fonctions de database.js.
// Ces fonctions servent à lire/écrire dans la base SQLite.
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
// Les intents indiquent ce que le bot a le droit de recevoir comme événements.
const client = new Client({
    intents: [
        // Nécessaire pour les commandes slash et les infos de serveur.
        GatewayIntentBits.Guilds,

        // Nécessaire pour récupérer les membres et gérer les rôles.
        GatewayIntentBits.GuildMembers,

        // Utile si plus tard tu veux exploiter l'activité vocale.
        GatewayIntentBits.GuildVoiceStates,

        // Nécessaire pour détecter le message de confirmation de DISBOARD après un bump.
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

/* =========================
   OUTILS
========================= */

// Vérifie si un membre est considéré comme staff par le bot.
// Trois cas sont acceptés :
// 1. Administrateur Discord.
// 2. Permission ManageRoles.
// 3. Rôle staff configuré avec /config role_staff.
function isStaff(member) {
    if (!member) return false;

    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
    }

    if (member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return true;
    }

    const staffRoleId = getSetting({
        guildId: member.guild.id,
        key: "staff_role_id"
    });

    if (!staffRoleId) {
        return false;
    }

    return member.roles.cache.has(staffRoleId);
}

// Coupe un texte trop long pour éviter de dépasser les limites Discord.
function truncate(text, maxLength = 900) {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + "...";
}

// Transforme les \n tapés dans Discord en vrais retours à la ligne.
// Exemple : "ligne 1\nligne 2" devient :
// ligne 1
// ligne 2
function formatMultilineInput(text, maxLength = 900) {
    if (!text) return "";

    return truncate(
        text
            .replace(/\\n/g, "\n")
            .replace(/<br>/gi, "\n"),
        maxLength
    );
}

// Applique une image envoyée dans une commande slash à un embed.
// Les images ne viennent plus du .env : elles sont ajoutées au moment de publier.
function applyAttachmentImage(embed, attachment) {
    if (!attachment) return embed;

    if (attachment.contentType && !attachment.contentType.startsWith("image/")) {
        return embed;
    }

    return embed.setImage(attachment.url);
}

// ===== BOUTIQUE =====
const SHOP_ITEMS = {
    emoji_personnalise: {
        name: "Emoji personnalisé sur le serveur",
        price: 10,
        description: "Demande l'ajout d'un emoji personnalisé sur le serveur."
    },
    commande_personnalisee: {
        name: "Commande personnalisée",
        price: 20,
        description: "Crée une commande slash personnalisée pour le bot."
    },
    xp_boost: {
        name: "Boost d'XP",
        price: 5,
        description: "Obtiens +10 XP pour ton profil."
    },
    nude_colo: {
        name: "Nude de colo (fausse)",
        price: 15,
        description: "Ajoute une fausse photo de 'nude de colo' à ton profil."
    },
    trophee_personnalise: {
        name: "Trophée personnalisé",
        price: 30,
        description: "Obtiens un trophée personnalisé unique affiché dans ton profil. **Limité à 1 par personne.**"
    },
    theme_gazette: {
        name: "Thème de Gazette",
        price: 10,
        description: "Propose le thème principal de la prochaine Gazette."
    },
    film_soiree: {
        name: "Choisir le film des soirées popcorn",
        price: 8,
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

// Génère une URL de bannière avec le nombre de points (pour la Gazette)
function getPointsBannerUrl(points) {
    // Utilise placeholder.com pour générer une image dynamique avec le texte.
    // Remplace par ton propre générateur si tu en as un.
    return `https://via.placeholder.com/600x200/9b59b6/FFFFFF?text=+${points}+POINTS+BDL`;
}

// Ajoute un nombre de jours à une date.
// Sert pour calculer l'expiration des rôles temporaires.
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

// Retire un nombre de jours à une date.
// Sert pour les commandes d'archive/nettoyage.
function subtractDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() - days);
    return result;
}

// Transforme une date JavaScript en format texte ISO pour la base SQLite.
function formatDateForDatabase(date) {
    return date.toISOString();
}

// Calcule une date limite pour supprimer les anciennes données.
// Exemple : jours = 30 → date d'il y a 30 jours.
function getCleanupDate(days) {
    return subtractDays(new Date(), days).toISOString();
}

// Formate la taille d'un fichier.
// Utilisé dans /backup info.
function formatFileSize(bytes) {
    if (bytes < 1024) {
        return `${bytes} o`;
    }

    const kb = bytes / 1024;

    if (kb < 1024) {
        return `${kb.toFixed(2)} Ko`;
    }

    const mb = kb / 1024;
    return `${mb.toFixed(2)} Mo`;
}

// Génère une clé de semaine.
// Exemple : 2026-S21.
// Utilisé pour identifier une partie Membre Mystère.
function getWeekKey(date = new Date()) {
    const year = date.getFullYear();

    const firstDayOfYear = new Date(year, 0, 1);
    const pastDaysOfYear = Math.floor(
        (date - firstDayOfYear) / 86400000
    );

    const weekNumber = Math.ceil(
        (pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7
    );

    return `${year}-S${String(weekNumber).padStart(2, "0")}`;
}

// Fonction d'erreur propre.
// Si une commande plante, le bot essaie quand même de répondre à l'utilisateur.
async function replyError(interaction, message = "Une erreur est survenue.") {
    const payload = {
        content: `❌ ${message}`,
        flags: MessageFlags.Ephemeral
    };

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

// Crée les boutons de validation/refus pour une rumeur.
function createRumorButtons(rumorId) {
    const approveButton = new ButtonBuilder()
        .setCustomId(`rumor_approve_${rumorId}`)
        .setLabel("Approuver")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success);

    const rejectButton = new ButtonBuilder()
        .setCustomId(`rumor_reject_${rumorId}`)
        .setLabel("Refuser")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Danger);

    return new ActionRowBuilder().addComponents(approveButton, rejectButton);
}

// Crée les mêmes boutons, mais désactivés après traitement.
function createDisabledRumorButtons(rumorId) {
    const approveButton = new ButtonBuilder()
        .setCustomId(`rumor_approve_${rumorId}`)
        .setLabel("Approuver")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success)
        .setDisabled(true);

    const rejectButton = new ButtonBuilder()
        .setCustomId(`rumor_reject_${rumorId}`)
        .setLabel("Refuser")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true);

    return new ActionRowBuilder().addComponents(approveButton, rejectButton);
}

// Crée les boutons de validation/refus pour une validation de quête.
function createQuestSubmissionButtons(submissionId) {
    const approveButton = new ButtonBuilder()
        .setCustomId(`quest_approve_${submissionId}`)
        .setLabel("Approuver")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success);

    const rejectButton = new ButtonBuilder()
        .setCustomId(`quest_reject_${submissionId}`)
        .setLabel("Refuser")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Danger);

    return new ActionRowBuilder().addComponents(approveButton, rejectButton);
}

// Crée les boutons de quête désactivés après traitement.
function createDisabledQuestSubmissionButtons(submissionId) {
    const approveButton = new ButtonBuilder()
        .setCustomId(`quest_approve_${submissionId}`)
        .setLabel("Approuver")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success)
        .setDisabled(true);

    const rejectButton = new ButtonBuilder()
        .setCustomId(`quest_reject_${submissionId}`)
        .setLabel("Refuser")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true);

    return new ActionRowBuilder().addComponents(approveButton, rejectButton);
}

// Crée le bouton de participation à un Drop Event.
function createDropButton(dropId) {
    const joinButton = new ButtonBuilder()
        .setCustomId(`drop_join_${dropId}`)
        .setLabel("Participer")
        .setEmoji("🎁")
        .setStyle(ButtonStyle.Primary);

    return new ActionRowBuilder().addComponents(joinButton);
}

// Crée le bouton désactivé quand le Drop Event est terminé.
function createDisabledDropButton(dropId) {
    const joinButton = new ButtonBuilder()
        .setCustomId(`drop_join_${dropId}`)
        .setLabel("Drop terminé")
        .setEmoji("🎁")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

    return new ActionRowBuilder().addComponents(joinButton);
}

// Crée les boutons de validation/refus pour une demande boutique.
function createShopPurchaseButtons(purchaseId) {
    const approveButton = new ButtonBuilder()
        .setCustomId(`shop_approve_${purchaseId}`)
        .setLabel("Approuver l'achat")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success);

    const rejectButton = new ButtonBuilder()
        .setCustomId(`shop_reject_${purchaseId}`)
        .setLabel("Refuser l'achat")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Danger);

    return new ActionRowBuilder().addComponents(approveButton, rejectButton);
}

function createDisabledShopPurchaseButtons(purchaseId) {
    const approveButton = new ButtonBuilder()
        .setCustomId(`shop_approve_${purchaseId}`)
        .setLabel("Approuver l'achat")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success)
        .setDisabled(true);

    const rejectButton = new ButtonBuilder()
        .setCustomId(`shop_reject_${purchaseId}`)
        .setLabel("Refuser l'achat")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true);

    return new ActionRowBuilder().addComponents(approveButton, rejectButton);
}

/* =========================
   HANDLERS BOUTONS
========================= */

// Gère les clics sur les boutons de rumeur.
async function handleRumorButton(interaction) {
    if (!isStaff(interaction.member)) {
        await interaction.reply({
            content: "❌ Seul le staff peut valider ou refuser les rumeurs.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Le customId ressemble à : rumor_approve_12 ou rumor_reject_12.
    const parts = interaction.customId.split("_");
    const action = parts[1];
    const rumorId = Number(parts[2]);

    if (!rumorId || !["approve", "reject"].includes(action)) {
        await interaction.reply({
            content: "❌ Bouton invalide.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const rumor = getRumorById({
        guildId: interaction.guildId,
        rumorId
    });

    if (!rumor) {
        await interaction.reply({
            content: `❌ Aucune rumeur trouvée avec l’ID #${rumorId}.`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    if (rumor.status !== "pending") {
        await interaction.reply({
            content: `⚠️ Cette rumeur a déjà été traitée. Statut actuel : **${rumor.status}**.`,
            flags: MessageFlags.Ephemeral
        });
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

    const oldEmbed = interaction.message.embeds[0];

    const updatedEmbed = EmbedBuilder.from(oldEmbed)
        .spliceFields(3, 1, {
            name: "Statut",
            value: `${statusLabel} par ${interaction.user}`,
            inline: true
        });

    await interaction.update({
        embeds: [updatedEmbed],
        components: [createDisabledRumorButtons(rumorId)]
    });
}

// Gère les boutons de validation/refus de quêtes.
async function handleQuestSubmissionButton(interaction) {
    if (!isStaff(interaction.member)) {
        await interaction.reply({
            content: "❌ Seul le staff peut valider ou refuser les quêtes.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // customId : quest_approve_4 ou quest_reject_4.
    const parts = interaction.customId.split("_");
    const action = parts[1];
    const submissionId = Number(parts[2]);

    if (!submissionId || !["approve", "reject"].includes(action)) {
        await interaction.reply({
            content: "❌ Bouton invalide.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const submission = getQuestSubmissionById({
        guildId: interaction.guildId,
        submissionId
    });

    if (!submission) {
        await interaction.reply({
            content: `❌ Aucune validation trouvée avec l’ID #${submissionId}.`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    if (submission.status !== "pending") {
        await interaction.reply({
            content: `⚠️ Cette validation a déjà été traitée. Statut actuel : **${submission.status}**.`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Si le staff approuve, on valide la quête, on ajoute les points,
    // et on donne éventuellement le rôle temporaire.
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
            const member = await interaction.guild.members
                .fetch(submission.user_id)
                .catch(() => null);

            if (member) {
                const roleDays = submission.reward_role_days ?? 7;
                const expiresAt = addDays(new Date(), roleDays);

                await member.roles.add(
                    submission.reward_role_id,
                    `Rôle temporaire obtenu via quête : ${submission.quest_title}`
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

    // Si le staff refuse, on change juste le statut.
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
    const oldEmbed = interaction.message.embeds[0];

    const updatedEmbed = EmbedBuilder.from(oldEmbed)
        .spliceFields(4, 1, {
            name: "Statut",
            value: `${statusLabel} par ${interaction.user}`,
            inline: true
        });

    await interaction.update({
        embeds: [updatedEmbed],
        components: [createDisabledQuestSubmissionButtons(submissionId)]
    });
}

// Gère le clic sur le bouton Participer d’un Drop Event.
async function handleDropButton(interaction) {
    // customId : drop_join_3.
    const parts = interaction.customId.split("_");
    const action = parts[1];
    const dropId = Number(parts[2]);

    if (action !== "join" || !dropId) {
        await interaction.reply({
            content: "❌ Bouton Drop invalide.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const drop = getDropEventById({
        guildId: interaction.guildId,
        dropId
    });

    if (!drop) {
        await interaction.reply({
            content: "❌ Drop Event introuvable.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    if (drop.status !== "active") {
        await interaction.reply({
            content: "⚠️ Ce Drop Event est déjà terminé.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const participantsBefore = getDropParticipants({
        guildId: interaction.guildId,
        dropId
    });

    if (participantsBefore.length >= drop.max_winners) {
        await interaction.reply({
            content: "⚠️ Trop tard, tous les gagnants ont déjà été pris.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Tente d’ajouter le participant.
    try {
        addDropParticipant({
            guildId: interaction.guildId,
            dropId,
            userId: interaction.user.id
        });
    } catch (error) {
        await interaction.reply({
            content: "⚠️ Tu participes déjà à ce Drop Event.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Donne les points au participant.
    addPoints({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        amount: drop.reward_points,
        reason: `Drop Event : ${drop.title}`,
        isSecret: false,
        createdBy: interaction.client.user.id
    });

    const participants = getDropParticipants({
        guildId: interaction.guildId,
        dropId
    });

    const winnersText = participants
        .map((participant, index) => {
            return `**${index + 1}.** <@${participant.user_id}>`;
        })
        .join("\n");

    const isFinished = participants.length >= drop.max_winners;

    if (isFinished) {
        endDropEvent({
            guildId: interaction.guildId,
            dropId
        });
    }

    const oldEmbed = interaction.message.embeds[0];

    const updatedEmbed = EmbedBuilder.from(oldEmbed)
        .spliceFields(0, 1, {
            name: isFinished ? "🎁 Gagnants finaux" : "🎁 Participants",
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
}

// Gère les boutons de la boutique de points.
async function handleShopPurchaseButton(interaction) {
    if (!isStaff(interaction.member)) {
        await interaction.reply({
            content: "❌ Seul le staff peut valider ou refuser les achats boutique.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const parts = interaction.customId.split("_");
    const action = parts[1];
    const purchaseId = Number(parts[2]);

    if (!purchaseId || !["approve", "reject"].includes(action)) {
        await interaction.reply({
            content: "❌ Bouton boutique invalide.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const purchase = getShopPurchaseById({
        guildId: interaction.guildId,
        purchaseId
    });

    if (!purchase) {
        await interaction.reply({
            content: `❌ Aucune demande boutique trouvée avec l’ID #${purchaseId}.`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    if (purchase.status !== "pending") {
        await interaction.reply({
            content: `⚠️ Cette demande a déjà été traitée. Statut actuel : **${purchase.status}**.`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // ===== VÉRIFICATION TROPHÉE UNIQUE =====
    if (action === "approve" && purchase.item_key === "trophee_personnalise") {
        const existingTrophees = getShopPurchasesByStatus({
            guildId: interaction.guildId,
            status: "approved"
        }).filter(p => p.user_id === purchase.user_id && p.item_key === "trophee_personnalise");

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
                content:
                    `❌ <@${purchase.user_id}> n’a pas assez de points publics.\n` +
                    `Prix : **${purchase.price}** point(s), total actuel : **${total}**.`,
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

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(0x2ecc71)
            .spliceFields(5, 1, {
                name: "⚖️ Verdict",
                value: `✅ Achat approuvé par ${interaction.user}.\nLes **${purchase.price} point(s)** ont été retirés.`,
                inline: false
            });

        await interaction.update({
            embeds: [embed],
            components: [createDisabledShopPurchaseButtons(purchaseId)]
        });
        return;
    }

    updateShopPurchaseStatus({
        guildId: interaction.guildId,
        purchaseId,
        status: "rejected",
        reviewedBy: interaction.user.id,
        reviewReason: "Achat refusé via bouton staff."
    });

    const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(0xe74c3c)
        .spliceFields(5, 1, {
            name: "⚖️ Verdict",
            value: `❌ Achat refusé par ${interaction.user}.`,
            inline: false
        });

    await interaction.update({
        embeds: [embed],
        components: [createDisabledShopPurchaseButtons(purchaseId)]
    });
}

// Routeur des boutons.
// Selon le customId, on envoie vers la bonne fonction.
async function handleButtonInteraction(interaction) {
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
}

/* =========================
   JOBS AUTOMATIQUES
========================= */

// Nettoie les rôles temporaires expirés.
// Cette fonction est appelée au démarrage, puis toutes les 10 minutes.
async function cleanupExpiredTemporaryRoles(client) {
    const now = new Date().toISOString();

    const expiredRoles = getExpiredTemporaryRoles({ now });

    if (expiredRoles.length === 0) return;

    for (const tempRole of expiredRoles) {
        const guild = await client.guilds
            .fetch(tempRole.guild_id)
            .catch(() => null);

        if (!guild) {
            markTemporaryRoleRemoved({ id: tempRole.id });
            continue;
        }

        const member = await guild.members
            .fetch(tempRole.user_id)
            .catch(() => null);

        if (!member) {
            markTemporaryRoleRemoved({ id: tempRole.id });
            continue;
        }

        await member.roles.remove(
            tempRole.role_id,
            "Rôle temporaire BDL expiré"
        ).catch(console.error);

        markTemporaryRoleRemoved({ id: tempRole.id });
    }

    console.log(`🧹 ${expiredRoles.length} rôle(s) temporaire(s) expiré(s) nettoyé(s).`);
}

// Publie automatiquement un indice du Membre Mystère.
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

    const hint = getMysteryHintByNumber({
        guildId,
        gameId: game.id,
        hintNumber
    });

    if (!hint) {
        console.log(`📭 Aucun indice #${hintNumber} trouvé.`);
        return;
    }

    if (hint.published === 1) {
        console.log(`ℹ️ Indice #${hintNumber} déjà publié.`);
        return;
    }

    const mysteryChannelId = getSetting({
        guildId,
        key: "mystery_channel_id"
    });

    if (!mysteryChannelId) {
        console.log("❌ Aucun salon Membre Mystère configuré.");
        return;
    }

    const channel = await guild.channels
        .fetch(mysteryChannelId)
        .catch(() => null);

    if (!channel || !channel.isTextBased()) {
        console.log("❌ Salon Membre Mystère introuvable ou invalide.");
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle(`🕵️ Membre Mystère — Indice #${hintNumber}`)
        .setDescription(hint.content)
        .setFooter({
            text: "Faites vos propositions avec /mystere guess"
        })
        .setTimestamp();

    await channel.send({ embeds: [embed] });

    markMysteryHintPublished({
        guildId,
        gameId: game.id,
        hintNumber
    });

    console.log(`✅ Indice Membre Mystère #${hintNumber} publié.`);
}

// Envoie un rappel avant la révélation du Membre Mystère.
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

    const mysteryChannelId = getSetting({
        guildId,
        key: "mystery_channel_id"
    });

    if (!mysteryChannelId) {
        console.log("❌ Aucun salon Membre Mystère configuré pour le rappel.");
        return;
    }

    const channel = await guild.channels
        .fetch(mysteryChannelId)
        .catch(() => null);

    if (!channel || !channel.isTextBased()) {
        console.log("❌ Salon Membre Mystère introuvable pour le rappel.");
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle("🕵️ Révélation du Membre Mystère ce soir")
        .setDescription(
            "La révélation officielle aura lieu à **21h**.\n\n" +
            "Dernière chance pour faire une proposition avec `/mystere guess`."
        )
        .setTimestamp();

    await channel.send({ embeds: [embed] });

    console.log("✅ Rappel de révélation Membre Mystère envoyé.");
}

// Envoie un rappel pour bump le serveur.
async function sendBumpReminder(client, guildId) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
        console.log("❌ Serveur introuvable pour le rappel bump.");
        return;
    }

    const bumpChannelId = getSetting({
        guildId,
        key: "bump_channel_id"
    });

    const bumpRoleId = getSetting({
        guildId,
        key: "bump_role_id"
    });

    if (!bumpChannelId || !bumpRoleId) {
        console.log("📭 Rappel bump non configuré : salon ou rôle manquant.");
        return;
    }

    const channel = await guild.channels
        .fetch(bumpChannelId)
        .catch(() => null);

    if (!channel || !channel.isTextBased()) {
        console.log("❌ Salon bump introuvable ou invalide.");
        return;
    }

    const role = await guild.roles
        .fetch(bumpRoleId)
        .catch(() => null);

    if (!role) {
        console.log("❌ Rôle bump introuvable.");
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

    console.log("✅ Rappel bump envoyé.");
}

// Détecte les confirmations de bump de DISBOARD et programme le prochain rappel.
async function handleDisboardBumpMessage(message) {
    if (!message.guild) return;

    // ID officiel du bot DISBOARD.
    if (message.author.id !== "302050872383242240") return;

    const rawContent = [
        message.content ?? "",
        ...(message.embeds?.map(embed => {
            return [
                embed.title ?? "",
                embed.description ?? "",
                ...(embed.fields ?? []).map(field => `${field.name} ${field.value}`)
            ].join(" ");
        }) ?? [])
    ].join(" ").toLowerCase();

    const isSuccessfulBump =
        rawContent.includes("bump done") ||
        rawContent.includes("bumped") ||
        rawContent.includes("serveur bump") ||
        rawContent.includes("server bumped");

    if (!isSuccessfulBump) return;

    const nextBumpAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    setSetting({
        guildId: message.guild.id,
        key: "next_bump_at",
        value: nextBumpAt
    });

    console.log(`✅ Bump détecté. Prochain rappel programmé à ${nextBumpAt}.`);
}

// Vérifie si un rappel bump doit être envoyé.
async function checkScheduledBumpReminder(client, guildId) {
    if (!guildId) return;

    const nextBumpAt = getSetting({
        guildId,
        key: "next_bump_at"
    });

    if (!nextBumpAt) return;

    const nextDate = new Date(nextBumpAt);

    if (Number.isNaN(nextDate.getTime())) return;
    if (nextDate > new Date()) return;

    await sendBumpReminder(client, guildId);

    setSetting({
        guildId,
        key: "next_bump_at",
        value: ""
    });
}

/* =========================
   COMMANDES SLASH
========================= */

// Fonction principale qui gère toutes les commandes slash.
async function handleCommandInteraction(interaction) {
    if (interaction.commandName === "ping") {
        await interaction.reply("Pong 🏓 Le bot BDL fonctionne !");
        return;
    }

    /* =========================
       POINTS
    ========================= */

    if (interaction.commandName === "points") {
        const subcommand = interaction.options.getSubcommand();

        // /points ajouter
        if (subcommand === "ajouter") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Tu n’as pas la permission d’ajouter des points.",
                    flags: MessageFlags.Ephemeral
                });
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

            const totalPublic = getUserTotalPoints({
                guildId: interaction.guildId,
                userId: membre.id,
                includeSecret: false
            });

            if (secret) {
                await interaction.reply({
                    content:
                        `🕵️ **${nombre} point(s) secret(s)** ajoutés à ${membre}.\n` +
                        `Raison : ${raison}`,
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.reply(
                    `🏆 ${membre} gagne **+${nombre} point(s)** !\n` +
                    `Raison : ${raison}\n` +
                    `Total public : **${totalPublic} point(s)**.`
                );
            }

            return;
        }

        // /points retirer
        if (subcommand === "retirer") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Tu n’as pas la permission de retirer des points.",
                    flags: MessageFlags.Ephemeral
                });
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

            const totalPublic = getUserTotalPoints({
                guildId: interaction.guildId,
                userId: membre.id,
                includeSecret: false
            });

            const totalAvecSecrets = getUserTotalPoints({
                guildId: interaction.guildId,
                userId: membre.id,
                includeSecret: true
            });

            if (secret) {
                await interaction.reply({
                    content:
                        `🕵️ **-${nombre} point(s) secret(s)** retirés à ${membre}.\n` +
                        `Raison : ${raison}\n` +
                        `Total avec secrets : **${totalAvecSecrets} point(s)**.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await interaction.reply(
                `📉 ${membre} perd **-${nombre} point(s)**.\n` +
                `Raison : ${raison}\n` +
                `Total public : **${totalPublic} point(s)**.`
            );

            return;
        }

        // /points voir
        if (subcommand === "voir") {
            const membre = interaction.options.getUser("membre") ?? interaction.user;
            const inclureSecrets =
                interaction.options.getBoolean("inclure_secrets") ?? false;

            if (inclureSecrets && !isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut voir les points secrets.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const total = getUserTotalPoints({
                guildId: interaction.guildId,
                userId: membre.id,
                includeSecret: inclureSecrets
            });

            await interaction.reply({
                content:
                    `📊 ${membre} a **${total} point(s)**` +
                    `${inclureSecrets ? " au total, secrets inclus." : " publics."}`,
                flags: inclureSecrets ? MessageFlags.Ephemeral : undefined
            });

            return;
        }

        // /points classement
        if (subcommand === "classement") {
            const inclureSecrets =
                interaction.options.getBoolean("inclure_secrets") ?? false;

            if (inclureSecrets && !isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut voir le classement avec les points secrets.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const leaderboard = getLeaderboard({
                guildId: interaction.guildId,
                includeSecret: inclureSecrets,
                limit: 10
            });

            if (leaderboard.length === 0) {
                await interaction.reply("📊 Aucun point n’a encore été attribué.");
                return;
            }

            const lines = leaderboard.map((row, index) => {
                return `**${index + 1}.** <@${row.user_id}> — **${row.total} point(s)**`;
            });

            await interaction.reply({
                content:
                    `🏆 **Classement BDL**${inclureSecrets ? " — secrets inclus" : ""}\n\n` +
                    lines.join("\n"),
                flags: inclureSecrets ? MessageFlags.Ephemeral : undefined
            });

            return;
        }

        // /points historique
        if (subcommand === "historique") {
            const membre = interaction.options.getUser("membre") ?? interaction.user;
            const inclureSecrets =
                interaction.options.getBoolean("secrets") ?? false;

            if (inclureSecrets && !isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut voir l’historique avec les points secrets.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const history = getUserPointsHistory({
                guildId: interaction.guildId,
                userId: membre.id,
                includeSecret: inclureSecrets,
                limit: 15
            });

            const total = getUserTotalPoints({
                guildId: interaction.guildId,
                userId: membre.id,
                includeSecret: inclureSecrets
            });

            if (history.length === 0) {
                await interaction.reply({
                    content:
                        `📭 Aucun point trouvé pour ${membre}` +
                        `${inclureSecrets ? " avec les secrets inclus." : "."}`,
                    flags: inclureSecrets ? MessageFlags.Ephemeral : undefined
                });
                return;
            }

            const lines = history.map(point => {
                const date = point.created_at;
                const secretLabel = point.is_secret === 1 ? " 🕵️ secret" : "";

                return (
                    `**${point.amount > 0 ? "+" : ""}${point.amount}**${secretLabel} — ${date}\n` +
                    `> ${truncate(point.reason, 180)}`
                );
            });

            const embed = new EmbedBuilder()
                .setTitle(`📜 Historique des points — ${membre.username}`)
                .setDescription(
                    `Total : **${total} point(s)**` +
                    `${inclureSecrets ? " secrets inclus" : " publics"}`
                )
                .addFields({
                    name: "Dernières entrées",
                    value: truncate(lines.join("\n\n"), 3500)
                })
                .setFooter({
                    text: "Historique limité aux 15 dernières entrées."
                })
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                flags: inclureSecrets ? MessageFlags.Ephemeral : undefined
            });

            return;
        }
    }

    /* =========================
       RUMEURS
    ========================= */

    if (interaction.commandName === "rumeur") {
        const subcommand = interaction.options.getSubcommand();

        // /rumeur proposer
        if (subcommand === "proposer") {
            const texte = interaction.options.getString("texte");
            const cible = interaction.options.getUser("cible");
            const anonyme = interaction.options.getBoolean("anonyme") ?? false;

            const rumorId = addRumor({
                guildId: interaction.guildId,
                authorId: interaction.user.id,
                content: texte,
                targetUserId: cible ? cible.id : null,
                anonymous: anonyme
            });

            const staffChannelId = getSetting({
                guildId: interaction.guildId,
                key: "rumors_staff_channel_id"
            });

            if (staffChannelId) {
                const staffChannel = await interaction.guild.channels
                    .fetch(staffChannelId)
                    .catch(() => null);

                if (staffChannel && staffChannel.isTextBased()) {
                    const embed = new EmbedBuilder()
                        .setTitle("💬 Nouvelle rumeur proposée")
                        .setDescription(truncate(texte, 1000))
                        .addFields(
                            {
                                name: "ID",
                                value: `#${rumorId}`,
                                inline: true
                            },
                            {
                                name: "Auteur",
                                value: anonyme
                                    ? `${interaction.user} — souhaite être anonyme dans la Gazette`
                                    : `${interaction.user}`,
                                inline: false
                            },
                            {
                                name: "Cible",
                                value: cible ? `${cible}` : "Aucune cible indiquée",
                                inline: false
                            },
                            {
                                name: "Statut",
                                value: "En attente de validation",
                                inline: true
                            }
                        )
                        .setFooter({
                            text: "Clique sur un bouton ou utilise /rumeur approuver / refuser."
                        })
                        .setTimestamp();

                    await staffChannel.send({
                        embeds: [embed],
                        components: [createRumorButtons(rumorId)]
                    });
                }
            }

            await interaction.reply({
                content: `✅ Ta rumeur a été envoyée au staff pour validation ! (ID: #${rumorId})`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /rumeur liste
        if (subcommand === "liste") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut lister les rumeurs.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const status = interaction.options.getString("statut") ?? "pending";
            const rumors = getRumorsByStatus({
                guildId: interaction.guildId,
                status,
                limit: 10
            });

            if (rumors.length === 0) {
                await interaction.reply({
                    content: `📭 Aucune rumeur en statut **${status}**.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const lines = rumors.map(rumor => {
                return `**#${rumor.id}** — ${truncate(rumor.content, 100)}\n` +
                    `Auteur : ${rumor.anonymous ? "Anonyme" : `<@${rumor.author_id}>`} | ` +
                    `Statut : ${rumor.status}`;
            });

            await interaction.reply({
                content: `📜 **Rumeurs (${status})**\n\n${lines.join("\n\n")}`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /rumeur approuver
        if (subcommand === "approuver") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut approuver les rumeurs.",
                    flags: MessageFlags.Ephemeral
                });
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
                await interaction.reply({
                    content: `❌ Aucune rumeur trouvée avec l’ID #${rumorId}.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await interaction.reply({
                content: `✅ Rumeur #${rumorId} **approuvée**.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /rumeur refuser
        if (subcommand === "refuser") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut refuser les rumeurs.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const rumorId = interaction.options.getInteger("id");
            const raison = interaction.options.getString("raison") ?? "Aucune raison précisée.";

            const result = updateRumorStatus({
                guildId: interaction.guildId,
                rumorId,
                status: "rejected",
                reviewedBy: interaction.user.id,
                reviewReason: raison
            });

            if (result === 0) {
                await interaction.reply({
                    content: `❌ Aucune rumeur trouvée avec l’ID #${rumorId}.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await interaction.reply({
                content: `❌ Rumeur #${rumorId} **refusée**. Raison : ${raison}`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }

    /* =========================
       GAZETTE
    ========================= */
    if (interaction.commandName === "gazette") {
        const subcommand = interaction.options.getSubcommand();

        // /gazette brouillon
        if (subcommand === "brouillon") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut générer un brouillon de Gazette.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const leaderboard = getLeaderboard({
                guildId: interaction.guildId,
                includeSecret: false,
                limit: 5
            });

            const approvedRumors = getRumorsByStatus({
                guildId: interaction.guildId,
                status: "approved",
                limit: 3
            });

            const approvedQuests = getQuestSubmissionsByStatus({
                guildId: interaction.guildId,
                status: "approved",
                limit: 5
            });

            const pendingRumors = getPendingRumorCount();
            const pendingQuests = getPendingQuestSubmissionCount();

            const topMember = leaderboard[0] || { user_id: "Aucun", total: 0 };
            const pointsBannerUrl = getPointsBannerUrl(topMember.total);

            const embed = new EmbedBuilder()
                .setTitle("📰 **Brouillon de Gazette BDL**")
                .setDescription("Voici une base automatique pour la Gazette de cette semaine.")
                .setColor(0x9b59b6)
                .setImage(pointsBannerUrl)
                .addFields(
                    {
                        name: "🏆 Membre de la semaine",
                        value: `<@${topMember.user_id}> — **${topMember.total} points**\n${pointsBannerUrl}`,
                        inline: false
                    },
                    {
                        name: "📜 Rumeurs approuvées (à publier)",
                        value: approvedRumors.length > 0
                            ? approvedRumors.map(r => `• ${truncate(r.content, 150)}`).join("\n")
                            : "Aucune rumeur approuvée.",
                        inline: false
                    },
                    {
                        name: "🗺️ Quêtes validées",
                        value: approvedQuests.length > 0
                            ? approvedQuests.map(q => `• **${q.quest_title}** par <@${q.user_id}>`).join("\n")
                            : "Aucune quête validée.",
                        inline: false
                    },
                    {
                        name: "📊 Statistiques",
                        value: `Rumeurs en attente : **${pendingRumors}**\nValidations de quêtes en attente : **${pendingQuests}**`,
                        inline: true
                    }
                )
                .setFooter({
                    text: "Utilise /gazette publier pour finaliser la Gazette."
                })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        // /gazette publier
        if (subcommand === "publier") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut publier la Gazette.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const titre = interaction.options.getString("titre");
            const pepites = formatMultilineInput(interaction.options.getString("pepites"));
            const stats = formatMultilineInput(interaction.options.getString("stats"));
            const rumeur = formatMultilineInput(interaction.options.getString("rumeur"));
            const exploit = formatMultilineInput(interaction.options.getString("exploit"));
            const nominations = formatMultilineInput(interaction.options.getString("nominations") || "");
            const banniere = interaction.options.getAttachment("banniere");

            const gazetteChannelId = getSetting({
                guildId: interaction.guildId,
                key: "gazette_channel_id"
            });

            if (!gazetteChannelId) {
                await interaction.reply({
                    content: "❌ Aucun salon Gazette configuré. Utilise `/config salon` pour le définir.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const channel = await interaction.guild.channels
                .fetch(gazetteChannelId)
                .catch(() => null);

            if (!channel || !channel.isTextBased()) {
                await interaction.reply({
                    content: "❌ Salon Gazette introuvable.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const leaderboard = getLeaderboard({
                guildId: interaction.guildId,
                includeSecret: false,
                limit: 3
            });

            const topMember = leaderboard[0] || { user_id: "Aucun", total: 0 };
            const pointsBannerUrl = getPointsBannerUrl(topMember.total);

            const embed = new EmbedBuilder()
                .setTitle(`📰 **${titre}**`)
                .setDescription(
                    `**Édition du ${new Date().toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}**\n\n` +
                    `*La Gazette Royale qui délie les langues et lie les cœurs.*`
                )
                .setColor(0x9b59b6)
                .setImage(banniere ? banniere.url : pointsBannerUrl)
                .addFields(
                    {
                        name: "💎 Pépites de la semaine",
                        value: pepites || "Aucune pépite cette semaine.",
                        inline: false
                    },
                    {
                        name: "📊 Statistiques absurdes",
                        value: stats || "Aucune statistique cette semaine.",
                        inline: false
                    },
                    {
                        name: "🗞️ Rumeur de la semaine",
                        value: rumeur || "Aucune rumeur cette semaine.",
                        inline: false
                    },
                    {
                        name: "🏆 Exploit de la semaine",
                        value: exploit || "Aucun exploit cette semaine.",
                        inline: false
                    },
                    {
                        name: "👑 Classement Points BDL",
                        value: leaderboard.length > 0
                            ? leaderboard.map((row, index) =>
                                `**${index + 1}.** <@${row.user_id}> — **${row.total} points**`
                              ).join("\n")
                            : "Aucun point attribué.",
                        inline: true
                    },
                    {
                        name: "🎖️ Nominations",
                        value: nominations || "Aucune nomination cette semaine.",
                        inline: true
                    }
                )
                .setFooter({
                    text: "Une édition signée BDL Bot | /gazette brouillon pour un modèle"
                })
                .setTimestamp();

            await channel.send({ embeds: [embed] });
            await interaction.reply({
                content: `✅ Gazette publiée dans ${channel} !`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }

    /* =========================
       CONFIG
    ========================= */
    if (interaction.commandName === "config") {
        const subcommand = interaction.options.getSubcommand();

        // /config salon
        if (subcommand === "salon") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut configurer les salons.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const type = interaction.options.getString("type");
            const salon = interaction.options.getChannel("salon");

            setSetting({
                guildId: interaction.guildId,
                key: type,
                value: salon.id
            });

            await interaction.reply({
                content: `✅ Salon **${salon.name}** configuré pour **${type}**.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /config role_staff
        if (subcommand === "role_staff") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut configurer le rôle staff.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const role = interaction.options.getRole("role");

            setSetting({
                guildId: interaction.guildId,
                key: "staff_role_id",
                value: role.id
            });

            await interaction.reply({
                content: `✅ Rôle **${role.name}** configuré comme rôle staff BDL.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /config role_bump
        if (subcommand === "role_bump") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut configurer le rôle bump.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const role = interaction.options.getRole("role");

            setSetting({
                guildId: interaction.guildId,
                key: "bump_role_id",
                value: role.id
            });

            await interaction.reply({
                content: `✅ Rôle **${role.name}** configuré pour les rappels de bump.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /config voir
        if (subcommand === "voir") {
            const settings = getAllSettings({ guildId: interaction.guildId });

            if (settings.length === 0) {
                await interaction.reply({
                    content: "⚠️ Aucune configuration enregistrée pour ce serveur.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const lines = settings.map(setting => {
                return `**${setting.key}** : ${setting.value}`;
            });

            await interaction.reply({
                content: `📋 **Configuration actuelle du bot BDL**\n\n${lines.join("\n")}`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }

    /* =========================
       QUÊTES
    ========================= */
    if (interaction.commandName === "quete") {
        const subcommand = interaction.options.getSubcommand();

        // /quete publier
        if (subcommand === "publier") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut publier des quêtes.",
                    flags: MessageFlags.Ephemeral
                });
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

            const questsChannelId = getSetting({
                guildId: interaction.guildId,
                key: "quests_channel_id"
            });

            if (questsChannelId) {
                const channel = await interaction.guild.channels
                    .fetch(questsChannelId)
                    .catch(() => null);

                if (channel && channel.isTextBased()) {
                    const embed = new EmbedBuilder()
                        .setTitle(`🗺️ **Nouvelle quête : ${titre}**`)
                        .setDescription(description)
                        .setColor(0x3498db)
                        .addFields(
                            {
                                name: "🎯 Récompense",
                                value: `**${points} point(s)**` + (role ? ` + rôle **${role.name}** (${joursRole} jours)` : ""),
                                inline: true
                            },
                            {
                                name: "📌 ID de la quête",
                                value: `#${questId}`,
                                inline: true
                            }
                        )
                        .setFooter({
                            text: "Utilise /quete valider pour soumettre ta preuve."
                        })
                        .setTimestamp();

                    applyAttachmentImage(embed, image);

                    await channel.send({ embeds: [embed] });
                }
            }

            await interaction.reply({
                content: `✅ Quête **${titre}** publiée ! (ID: #${questId})`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /quete liste
        if (subcommand === "liste") {
            const quests = getActiveQuests({ guildId: interaction.guildId, limit: 10 });

            if (quests.length === 0) {
                await interaction.reply("📭 Aucune quête active pour le moment.");
                return;
            }

            const lines = quests.map(quest => {
                return `**#${quest.id} — ${quest.title}**\n` +
                    `${truncate(quest.description, 100)}\n` +
                    `Récompense : **${quest.reward_points} point(s)**` +
                    (quest.reward_role_id ? ` + rôle temporaire` : "") +
                    `\nStatut : ${quest.status}`;
            });

            await interaction.reply({
                content: `🗺️ **Quêtes actives**\n\n${lines.join("\n\n")}`
            });
            return;
        }

        // /quete valider
        if (subcommand === "valider") {
            const questId = interaction.options.getInteger("id");
            const preuve = formatMultilineInput(interaction.options.getString("preuve"));
            const photo = interaction.options.getAttachment("photo");
            const membreMentionne = interaction.options.getUser("membre_mentionne");
            const lien = interaction.options.getString("lien") ?? null;

            const quest = getQuestById({ guildId: interaction.guildId, questId });

            if (!quest) {
                await interaction.reply({
                    content: `❌ Aucune quête trouvée avec l’ID #${questId}.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (quest.status !== "active") {
                await interaction.reply({
                    content: `⚠️ La quête **${quest.title}** n’est plus active.`,
                    flags: MessageFlags.Ephemeral
                });
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

                await interaction.reply({
                    content: `✅ Ta validation pour la quête **${quest.title}** a été envoyée au staff !`,
                    flags: MessageFlags.Ephemeral
                });
            } catch (error) {
                await interaction.reply({
                    content: `⚠️ Tu as déjà soumis une validation pour cette quête.`,
                    flags: MessageFlags.Ephemeral
                });
            }
            return;
        }

        // /quete submissions
        if (subcommand === "submissions") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut voir les validations de quêtes.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const status = interaction.options.getString("statut") ?? "pending";
            const submissions = getQuestSubmissionsByStatus({
                guildId: interaction.guildId,
                status,
                limit: 10
            });

            if (submissions.length === 0) {
                await interaction.reply({
                    content: `📭 Aucune validation de quête en statut **${status}**.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const lines = submissions.map(sub => {
                return `**#${sub.id}** — Quête **${sub.quest_title}** par <@${sub.user_id}>\n` +
                    `Preuve : ${truncate(sub.proof, 80)} | Statut : ${sub.status}`;
            });

            await interaction.reply({
                content: `📜 **Validations de quêtes (${status})**\n\n${lines.join("\n\n")}`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /quete approuver
        if (subcommand === "approuver") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut approuver les validations de quêtes.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const submissionId = interaction.options.getInteger("id");

            const submission = getQuestSubmissionById({
                guildId: interaction.guildId,
                submissionId
            });

            if (!submission) {
                await interaction.reply({
                    content: `❌ Aucune validation trouvée avec l’ID #${submissionId}.`,
                    flags: MessageFlags.Ephemeral
                });
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
                const member = await interaction.guild.members
                    .fetch(submission.user_id)
                    .catch(() => null);

                if (member) {
                    const expiresAt = addDays(new Date(), submission.reward_role_days ?? 7);

                    await member.roles.add(
                        submission.reward_role_id,
                        `Rôle temporaire obtenu via quête : ${submission.quest_title}`
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

            await interaction.reply({
                content: `✅ Validation #${submissionId} **approuvée**. Les points et le rôle (si applicable) ont été attribués.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /quete refuser
        if (subcommand === "refuser") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut refuser les validations de quêtes.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const submissionId = interaction.options.getInteger("id");
            const raison = interaction.options.getString("raison") ?? "Aucune raison précisée.";

            const result = updateQuestSubmissionStatus({
                guildId: interaction.guildId,
                submissionId,
                status: "rejected",
                reviewedBy: interaction.user.id,
                reviewReason: raison
            });

            if (result === 0) {
                await interaction.reply({
                    content: `❌ Aucune validation trouvée avec l’ID #${submissionId}.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await interaction.reply({
                content: `❌ Validation #${submissionId} **refusée**. Raison : ${raison}`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /quete fermer
        if (subcommand === "fermer") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut fermer les quêtes.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const questId = interaction.options.getInteger("id");

            const result = closeQuest({
                guildId: interaction.guildId,
                questId
            });

            if (result === 0) {
                await interaction.reply({
                    content: `❌ Aucune quête trouvée avec l’ID #${questId}.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await interaction.reply({
                content: `✅ Quête #${questId} **fermée**.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }

    /* =========================
       RÔLES TEMPORAIRES
    ========================= */
    if (interaction.commandName === "role") {
        const subcommand = interaction.options.getSubcommand();

        // /role temporaire
        if (subcommand === "temporaire") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut donner des rôles temporaires.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const membre = interaction.options.getUser("membre");
            const role = interaction.options.getRole("role");
            const jours = interaction.options.getInteger("jours");
            const raison = interaction.options.getString("raison") ?? "Aucune raison précisée.";

            const expiresAt = addDays(new Date(), jours);

            const member = await interaction.guild.members
                .fetch(membre.id)
                .catch(() => null);

            if (!member) {
                await interaction.reply({
                    content: "❌ Membre introuvable.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await member.roles.add(
                role.id,
                `Rôle temporaire : ${raison}`
            ).catch(async () => {
                await interaction.reply({
                    content: "❌ Impossible d'ajouter le rôle. Vérifie les permissions du bot.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            });

            addTemporaryRole({
                guildId: interaction.guildId,
                userId: membre.id,
                roleId: role.id,
                reason: raison,
                expiresAt: formatDateForDatabase(expiresAt),
                createdBy: interaction.user.id
            });

            await interaction.reply({
                content: `✅ Rôle **${role.name}** donné à ${membre} pour **${jours} jour(s)**.\nRaison : ${raison}`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /role liste
        if (subcommand === "liste") {
            const tempRoles = getActiveTemporaryRoles({ guildId: interaction.guildId, limit: 20 });

            if (tempRoles.length === 0) {
                await interaction.reply("📭 Aucun rôle temporaire actif.");
                return;
            }

            const lines = tempRoles.map(tempRole => {
                const expiresAt = new Date(tempRole.expires_at);
                const daysLeft = Math.ceil((expiresAt - new Date()) / (1000 * 60 * 60 * 24));
                return `**<@${tempRole.user_id}>** — **${tempRole.role_id}**\n` +
                    `Expire dans **${daysLeft} jour(s)** | Raison : ${tempRole.reason}`;
            });

            await interaction.reply({
                content: `🎭 **Rôles temporaires actifs**\n\n${lines.join("\n\n")}`
            });
            return;
        }
    }

    /* =========================
       MEMBRE MYSTÈRE
    ========================= */
    if (interaction.commandName === "mystere") {
        const subcommand = interaction.options.getSubcommand();

        // /mystere set
        if (subcommand === "set") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut définir le Membre Mystère.",
                    flags: MessageFlags.Ephemeral
                });
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

            const mysteryChannelId = getSetting({
                guildId: interaction.guildId,
                key: "mystery_channel_id"
            });

            if (mysteryChannelId) {
                const channel = await interaction.guild.channels
                    .fetch(mysteryChannelId)
                    .catch(() => null);

                if (channel && channel.isTextBased()) {
                    const embed = new EmbedBuilder()
                        .setTitle(`🕵️ **Membre Mystère — ${semaine}**`)
                        .setDescription(
                            "Un membre de la communauté a été choisi secrètement.\n" +
                            "À toi de deviner qui c'est en utilisant les indices !\n\n" +
                            "Utilise `/mystere guess` pour proposer une réponse."
                        )
                        .setColor(0xf39c12)
                        .setTimestamp();

                    applyAttachmentImage(embed, image);

                    await channel.send({ embeds: [embed] });
                }
            }

            await interaction.reply({
                content: `✅ Membre Mystère défini : **${membre}** pour la semaine **${semaine}** (ID: #${gameId}).`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /mystere indice
        if (subcommand === "indice") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut ajouter des indices.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const game = getActiveMysteryGame({ guildId: interaction.guildId });

            if (!game) {
                await interaction.reply({
                    content: "❌ Aucune partie Membre Mystère active. Utilise `/mystere set` pour en créer une.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const numero = interaction.options.getInteger("numero");
            const texte = formatMultilineInput(interaction.options.getString("texte"));
            const publier = interaction.options.getBoolean("publier") ?? false;

            addMysteryHint({
                guildId: interaction.guildId,
                gameId: game.id,
                hintNumber: numero,
                content: texte
            });

            if (publier) {
                markMysteryHintPublished({
                    guildId: interaction.guildId,
                    gameId: game.id,
                    hintNumber: numero
                });

                const mysteryChannelId = getSetting({
                    guildId: interaction.guildId,
                    key: "mystery_channel_id"
                });

                if (mysteryChannelId) {
                    const channel = await interaction.guild.channels
                        .fetch(mysteryChannelId)
                        .catch(() => null);

                    if (channel && channel.isTextBased()) {
                        const embed = new EmbedBuilder()
                            .setTitle(`🕵️ Membre Mystère — Indice #${numero}`)
                            .setDescription(texte)
                            .setFooter({
                                text: "Faites vos propositions avec /mystere guess"
                            })
                            .setTimestamp();

                        await channel.send({ embeds: [embed] });
                    }
                }
            }

            await interaction.reply({
                content: `✅ Indice #${numero} ${publier ? "publié" : "enregistré"} pour la partie #${game.id}.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /mystere guess
        if (subcommand === "guess") {
            const game = getActiveMysteryGame({ guildId: interaction.guildId });

            if (!game) {
                await interaction.reply({
                    content: "❌ Aucune partie Membre Mystère active.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (hasMysteryGuessToday({
                guildId: interaction.guildId,
                gameId: game.id,
                userId: interaction.user.id
            })) {
                await interaction.reply({
                    content: "⚠️ Tu as déjà fait une proposition aujourd’hui. Reviens demain !",
                    flags: MessageFlags.Ephemeral
                });
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

            if (isCorrect) {
                await interaction.reply({
                    content: `🎉 **Bravo !** Tu as trouvé le Membre Mystère : **${membre}** ! Attends la révélation officielle.`,
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.reply({
                    content: `❌ Ce n’est pas **${membre}**... Réessaye demain !`,
                    flags: MessageFlags.Ephemeral
                });
            }
            return;
        }

        // /mystere reveal
        if (subcommand === "reveal") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut révéler le Membre Mystère.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const game = getActiveMysteryGame({ guildId: interaction.guildId });

            if (!game) {
                await interaction.reply({
                    content: "❌ Aucune partie Membre Mystère active.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const firstCorrectGuess = getFirstCorrectMysteryGuess({
                guildId: interaction.guildId,
                gameId: game.id
            });

            const winnerUserId = firstCorrectGuess?.user_id || null;

            revealMysteryGame({
                guildId: interaction.guildId,
                gameId: game.id,
                winnerUserId
            });

            const targetMember = await interaction.guild.members
                .fetch(game.target_user_id)
                .catch(() => null);

            const mysteryChannelId = getSetting({
                guildId: interaction.guildId,
                key: "mystery_channel_id"
            });

            if (mysteryChannelId) {
                const channel = await interaction.guild.channels
                    .fetch(mysteryChannelId)
                    .catch(() => null);

                if (channel && channel.isTextBased()) {
                    let description = `🎉 **Le Membre Mystère était... <@${game.target_user_id}> !**\n\n`;

                    if (winnerUserId) {
                        const winnerPoints = 10; // Points pour avoir trouvé le Membre Mystère
                        addPoints({
                            guildId: interaction.guildId,
                            userId: winnerUserId,
                            amount: winnerPoints,
                            reason: `Membre Mystère trouvé (semaine ${game.week_key})`,
                            isSecret: false,
                            createdBy: interaction.client.user.id
                        });

                        description += `🏆 **<@${winnerUserId}>** a trouvé en premier et gagne **+${winnerPoints} points** !`;
                    } else {
                        description += "Personne n’a trouvé le bon membre cette fois...";
                    }

                    const embed = new EmbedBuilder()
                        .setTitle(`🕵️ **Révélation du Membre Mystère — ${game.week_key}**`)
                        .setDescription(description)
                        .setColor(0x2ecc71)
                        .setTimestamp();

                    await channel.send({ embeds: [embed] });
                }
            }

            await interaction.reply({
                content: `✅ Membre Mystère révélé : **${targetMember || game.target_user_id}** !`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /mystere statut
        if (subcommand === "statut") {
            const game = getActiveMysteryGame({ guildId: interaction.guildId });

            if (!game) {
                await interaction.reply({
                    content: "❌ Aucune partie Membre Mystère active. Utilise `/mystere set` pour en créer une.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const hints = getMysteryHints({
                guildId: interaction.guildId,
                gameId: game.id
            });

            const publishedHints = hints.filter(h => h.published === 1);
            const unpublishedHints = hints.filter(h => h.published === 0);

            const guesses = getTopCorrectMysteryGuessers({
                guildId: interaction.guildId,
                gameId: game.id,
                limit: 3
            });

            const embed = new EmbedBuilder()
                .setTitle(`🕵️ **Membre Mystère — ${game.week_key}**`)
                .setDescription(
                    `Partie active depuis le ${new Date(game.created_at).toLocaleDateString("fr-FR")}\n` +
                    `Cible : **<@${game.target_user_id}>** (visible uniquement par le staff)\n\n` +
                    `📜 **Indices** : ${publishedHints.length} publiés, ${unpublishedHints.length} en attente\n` +
                    `🎯 **Bonne(s) réponse(s)** : ${guesses.length > 0 ? guesses.map(g => `<@${g.user_id}>`).join(", ") : "Aucune"}`
                )
                .setColor(0xf39c12)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }
    }

    /* =========================
       DROP EVENTS
    ========================= */
    if (interaction.commandName === "drop") {
        const subcommand = interaction.options.getSubcommand();

        // /drop lancer
        if (subcommand === "lancer") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut lancer un Drop Event.",
                    flags: MessageFlags.Ephemeral
                });
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
                .setDescription(
                    `Les **${gagnants} premiers** à cliquer sur le bouton ci-dessous gagnent **+${points} point(s)** !\n\n` +
                    `⚠️ **Un seul clic par personne !**`
                )
                .setColor(0xe74c3c)
                .setTimestamp();

            applyAttachmentImage(embed, image);

            const message = await interaction.reply({
                embeds: [embed],
                components: [createDropButton(dropId)],
                fetchReply: true
            });

            setDropMessageId({
                guildId: interaction.guildId,
                dropId,
                messageId: message.id
            });
            return;
        }
    }

    /* =========================
       GRAND MAÎTRE
    ========================= */
    if (interaction.commandName === "grandmaitre") {
        const subcommand = interaction.options.getSubcommand();

        // /grandmaitre classement
        if (subcommand === "classement") {
            const mois = interaction.options.getInteger("mois") ?? new Date().getMonth() + 1;
            const annee = interaction.options.getInteger("annee") ?? new Date().getFullYear();
            const secrets = interaction.options.getBoolean("secrets") ?? false;

            if (secrets && !isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut voir le classement avec les points secrets.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const leaderboard = getMonthlyLeaderboard({
                guildId: interaction.guildId,
                year: annee,
                month: mois,
                includeSecret: secrets,
                limit: 10
            });

            if (leaderboard.length === 0) {
                await interaction.reply({
                    content: `📊 Aucun point n’a été attribué pour **${new Date(annee, mois - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}**.`,
                    flags: secrets ? MessageFlags.Ephemeral : undefined
                });
                return;
            }

            const lines = leaderboard.map((row, index) => {
                return `**${index + 1}.** <@${row.user_id}> — **${row.total} point(s)**`;
            });

            await interaction.reply({
                content:
                    `🏆 **Classement Grand Maître — ${new Date(annee, mois - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}**${secrets ? " (secrets inclus)" : ""}\n\n` +
                    lines.join("\n"),
                flags: secrets ? MessageFlags.Ephemeral : undefined
            });
            return;
        }

        // /grandmaitre couronner
        if (subcommand === "couronner") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut couronner le Grand Maître.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const mois = interaction.options.getInteger("mois") ?? new Date().getMonth() + 1;
            const annee = interaction.options.getInteger("annee") ?? new Date().getFullYear();

            const leaderboard = getMonthlyLeaderboard({
                guildId: interaction.guildId,
                year: annee,
                month: mois,
                includeSecret: false,
                limit: 1
            });

            if (leaderboard.length === 0) {
                await interaction.reply({
                    content: `📊 Aucun point n’a été attribué pour **${new Date(annee, mois - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}**.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const winner = leaderboard[0];
            const grandMasterRoleId = getSetting({
                guildId: interaction.guildId,
                key: "grand_master_role_id"
            });

            if (!grandMasterRoleId) {
                await interaction.reply({
                    content: "❌ Aucun rôle Grand Maître configuré. Utilise `/config` pour le définir.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const member = await interaction.guild.members
                .fetch(winner.user_id)
                .catch(() => null);

            if (!member) {
                await interaction.reply({
                    content: "❌ Membre introuvable.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await member.roles.add(
                grandMasterRoleId,
                `Grand Maître du Serveur — ${new Date(annee, mois - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`
            ).catch(async () => {
                await interaction.reply({
                    content: "❌ Impossible de donner le rôle. Vérifie les permissions du bot.",
                    flags: MessageFlags.Ephemeral
                });
            });

            await interaction.reply({
                content: `👑 **<@${winner.user_id}>** est couronné **Grand Maître du Serveur** pour **${new Date(annee, mois - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}** !`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }

    /* =========================
       PROFIL
    ========================= */
    if (interaction.commandName === "profil") {
        const membre = interaction.options.getUser("membre") ?? interaction.user;
        const secrets = interaction.options.getBoolean("secrets") ?? false;

        if (secrets && !isStaff(interaction.member)) {
            await interaction.reply({
                content: "❌ Seul le staff peut voir les points secrets.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        const totalPoints = getUserTotalPoints({
            guildId: interaction.guildId,
            userId: membre.id,
            includeSecret: secrets
        });

        const approvedRumors = getUserApprovedRumorCount({
            guildId: interaction.guildId,
            userId: membre.id
        });

        const approvedQuests = getUserApprovedQuestCount({
            guildId: interaction.guildId,
            userId: membre.id
        });

        const rank = getUserRank({
            guildId: interaction.guildId,
            userId: membre.id,
            includeSecret: secrets
        });

        const bannerUrl = getPointsBannerUrl(totalPoints);

        const embed = new EmbedBuilder()
            .setTitle(`📜 Profil BDL — ${membre.username}`)
            .setDescription(`**Points** : **${totalPoints}** ${secrets ? "(secrets inclus)" : ""}`)
            .setColor(0x3498db)
            .setImage(bannerUrl)
            .addFields(
                {
                    name: "🏆 Classement",
                    value: rank ? `**#${rank.rank}** / ${getLeaderboard({ guildId: interaction.guildId, includeSecret: secrets }).length}` : "Non classé",
                    inline: true
                },
                {
                    name: "📜 Rumeurs approuvées",
                    value: `**${approvedRumors}**`,
                    inline: true
                },
                {
                    name: "🗺️ Quêtes validées",
                    value: `**${approvedQuests}**`,
                    inline: true
                }
            )
            .setFooter({
                text: "BDL Bot — Utilise /boutique pour acheter des récompenses !"
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        return;
    }

    /* =========================
       BOUTIQUE
    ========================= */
    if (interaction.commandName === "boutique") {
        const subcommand = interaction.options.getSubcommand();

        // /boutique voir
        if (subcommand === "voir") {
            const embed = new EmbedBuilder()
                .setTitle("🛒 **Boutique de points BDL**")
                .setDescription(
                    "Achète des récompenses avec tes points accumulés !\n\n" +
                    formatShopItemList()
                )
                .setColor(0xf1c40f)
                .setFooter({
                    text: "Utilise /boutique acheter pour faire un achat."
                })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            return;
        }

        // /boutique acheter
        if (subcommand === "acheter") {
            const itemKey = interaction.options.getString("item");
            const note = interaction.options.getString("note") ?? null;

            const item = SHOP_ITEMS[itemKey];

            if (!item) {
                await interaction.reply({
                    content: "❌ Objet introuvable dans la boutique.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const userTotal = getUserTotalPoints({
                guildId: interaction.guildId,
                userId: interaction.user.id,
                includeSecret: false
            });

            if (userTotal < item.price) {
                await interaction.reply({
                    content: `❌ Tu n’as pas assez de points pour acheter **${item.name}** (prix : **${item.price} points**, ton total : **${userTotal}**).`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Vérification spéciale pour le trophée (1 max par personne)
            if (itemKey === "trophee_personnalise") {
                const existingTrophees = getShopPurchasesByStatus({
                    guildId: interaction.guildId,
                    status: "approved"
                }).filter(p => p.user_id === interaction.user.id && p.item_key === "trophee_personnalise");

                if (existingTrophees.length >= 1) {
                    await interaction.reply({
                        content: "❌ **Limite atteinte** : Tu as déjà un **trophée personnalisé** (1 max par personne).",
                        flags: MessageFlags.Ephemeral
                    });
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

            const staffChannelId = getSetting({
                guildId: interaction.guildId,
                key: "shop_staff_channel_id"
            });

            if (staffChannelId) {
                const staffChannel = await interaction.guild.channels
                    .fetch(staffChannelId)
                    .catch(() => null);

                if (staffChannel && staffChannel.isTextBased()) {
                    const embed = new EmbedBuilder()
                        .setTitle("🛒 Nouvelle demande d'achat boutique")
                        .setDescription(`**${item.name}** — **${item.price} points**`)
                        .addFields(
                            {
                                name: "ID",
                                value: `#${purchaseId}`,
                                inline: true
                            },
                            {
                                name: "Acheteur",
                                value: `${interaction.user}`,
                                inline: true
                            },
                            {
                                name: "Note",
                                value: note || "Aucune note",
                                inline: false
                            },
                            {
                                name: "Statut",
                                value: "En attente de validation",
                                inline: true
                            }
                        )
                        .setFooter({
                            text: "Clique sur un bouton ou utilise /boutique approuver / refuser."
                        })
                        .setTimestamp();

                    await staffChannel.send({
                        embeds: [embed],
                        components: [createShopPurchaseButtons(purchaseId)]
                    });
                }
            }

            await interaction.reply({
                content: `✅ Ta demande pour **${item.name}** (${item.price} points) a été envoyée au staff pour validation ! (ID: #${purchaseId})`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /boutique demandes
        if (subcommand === "demandes") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut voir les demandes boutique.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const status = interaction.options.getString("statut") ?? "pending";
            const purchases = getShopPurchasesByStatus({
                guildId: interaction.guildId,
                status,
                limit: 10
            });

            if (purchases.length === 0) {
                await interaction.reply({
                    content: `📭 Aucune demande boutique en statut **${status}**.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const lines = purchases.map(purchase => {
                return `**#${purchase.id}** — **${purchase.item_name}** par ${purchase.user_id}\n` +
                    `Prix : **${purchase.price} points** | Statut : ${purchase.status}`;
            });

            await interaction.reply({
                content: `🛒 **Demandes boutique (${status})**\n\n${lines.join("\n\n")}`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /boutique approuver
        if (subcommand === "approuver") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut approuver les achats boutique.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const purchaseId = interaction.options.getInteger("id");

            const purchase = getShopPurchaseById({
                guildId: interaction.guildId,
                purchaseId
            });

            if (!purchase) {
                await interaction.reply({
                    content: `❌ Aucune demande boutique trouvée avec l’ID #${purchaseId}.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (purchase.status !== "pending") {
                await interaction.reply({
                    content: `⚠️ Cette demande a déjà été traitée. Statut actuel : **${purchase.status}**.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            // Vérification spéciale pour le trophée (1 max par personne)
            if (purchase.item_key === "trophee_personnalise") {
                const existingTrophees = getShopPurchasesByStatus({
                    guildId: interaction.guildId,
                    status: "approved"
                }).filter(p => p.user_id === purchase.user_id && p.item_key === "trophee_personnalise");

                if (existingTrophees.length >= 1) {
                    await interaction.reply({
                        content: "❌ **Limite atteinte** : Ce membre a déjà un trophée personnalisé (1 max par personne).",
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
            }

            const total = getUserTotalPoints({
                guildId: interaction.guildId,
                userId: purchase.user_id,
                includeSecret: false
            });

            if (total < purchase.price) {
                await interaction.reply({
                    content:
                        `❌ <@${purchase.user_id}> n’a pas assez de points publics.\n` +
                        `Prix : **${purchase.price}** point(s), total actuel : **${total}**.`,
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
                reviewReason: "Achat approuvé via commande staff."
            });

            await interaction.reply({
                content: `✅ Demande #${purchaseId} **approuvée**. Les **${purchase.price} points** ont été retirés à <@${purchase.user_id}>.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /boutique refuser
        if (subcommand === "refuser") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut refuser les achats boutique.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const purchaseId = interaction.options.getInteger("id");
            const raison = interaction.options.getString("raison") ?? "Aucune raison précisée.";

            const result = updateShopPurchaseStatus({
                guildId: interaction.guildId,
                purchaseId,
                status: "rejected",
                reviewedBy: interaction.user.id,
                reviewReason: raison
            });

            if (result === 0) {
                await interaction.reply({
                    content: `❌ Aucune demande boutique trouvée avec l’ID #${purchaseId}.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await interaction.reply({
                content: `❌ Demande #${purchaseId} **refusée**. Raison : ${raison}`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }

    /* =========================
       BACKUP
    ========================= */
    if (interaction.commandName === "backup") {
        const subcommand = interaction.options.getSubcommand();

        // /backup export
        if (subcommand === "export") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut exporter la base de données.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "data", "bdl.sqlite");
            const attachment = new AttachmentBuilder(dbPath, { name: "bdl_backup.sqlite" });

            await interaction.reply({
                content: "💾 Voici la base de données SQLite du bot.",
                files: [attachment],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /backup info
        if (subcommand === "info") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut voir les infos de la base.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const stats = getBackupStats();
            const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "data", "bdl.sqlite");
            const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

            const embed = new EmbedBuilder()
                .setTitle("🗃️ **Infos Base de Données BDL**")
                .setColor(0x3498db)
                .addFields(
                    { name: "📊 Points", value: `${stats.points}`, inline: true },
                    { name: "💬 Rumeurs", value: `${stats.rumors}`, inline: true },
                    { name: "🗺️ Quêtes", value: `${stats.quests}`, inline: true },
                    { name: "✅ Validations de quêtes", value: `${stats.questSubmissions}`, inline: true },
                    { name: "🎭 Rôles temporaires", value: `${stats.temporaryRoles}`, inline: true },
                    { name: "🕵️ Parties Membre Mystère", value: `${stats.mysteryGames}`, inline: true },
                    { name: "💡 Indices Membre Mystère", value: `${stats.mysteryHints}`, inline: true },
                    { name: "🎯 Réponses Membre Mystère", value: `${stats.mysteryGuesses}`, inline: true },
                    { name: "🎁 Drop Events", value: `${stats.dropEvents}`, inline: true },
                    { name: "👥 Participants Drop Events", value: `${stats.dropParticipants}`, inline: true },
                    { name: "🛒 Achats boutique", value: `${stats.shopPurchases}`, inline: true },
                    { name: "⚙️ Paramètres", value: `${stats.settings}`, inline: true },
                    { name: "💾 Taille de la base", value: formatFileSize(dbSize), inline: false },
                    { name: "🔄 Rôles temporaires actifs", value: `${getActiveTemporaryRoleCount()}`, inline: true },
                    { name: "⏳ Rumeurs en attente", value: `${getPendingRumorCount()}`, inline: true },
                    { name: "⏳ Validations de quêtes en attente", value: `${getPendingQuestSubmissionCount()}`, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }
    }

    /* =========================
       ARCHIVE
    ========================= */
    if (interaction.commandName === "archive") {
        const subcommand = interaction.options.getSubcommand();

        // /archive old_drops
        if (subcommand === "old_drops") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut nettoyer les données.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const confirmer = interaction.options.getBoolean("confirmer");
            const jours = interaction.options.getInteger("jours") ?? 30;

            if (!confirmer) {
                await interaction.reply({
                    content: `⚠️ **Attention** : Cette commande supprimera tous les Drop Events **terminés depuis plus de ${jours} jours**.\n` +
                        `Utilise \`/archive old_drops confirmer:true jours:${jours}\` pour confirmer.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const beforeDate = getCleanupDate(jours);
            const result = deleteOldDropEvents({ beforeDate });

            await interaction.reply({
                content: `🗑️ **${result.events} Drop Events** et **${result.participants} participants** supprimés (terminés depuis +${jours} jours).`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /archive old_rumors
        if (subcommand === "old_rumors") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut nettoyer les données.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const confirmer = interaction.options.getBoolean("confirmer");
            const jours = interaction.options.getInteger("jours") ?? 30;

            if (!confirmer) {
                await interaction.reply({
                    content: `⚠️ **Attention** : Cette commande supprimera toutes les rumeurs **refusées depuis plus de ${jours} jours**.\n` +
                        `Utilise \`/archive old_rumors confirmer:true jours:${jours}\` pour confirmer.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const beforeDate = getCleanupDate(jours);
            const result = deleteOldRejectedRumors({ beforeDate });

            await interaction.reply({
                content: `🗑️ **${result.rumors} rumeurs refusées** supprimées (refusées depuis +${jours} jours).`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /archive old_mysteries
        if (subcommand === "old_mysteries") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut nettoyer les données.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const confirmer = interaction.options.getBoolean("confirmer");
            const jours = interaction.options.getInteger("jours") ?? 30;

            if (!confirmer) {
                await interaction.reply({
                    content: `⚠️ **Attention** : Cette commande supprimera toutes les parties Membre Mystère **terminées depuis plus de ${jours} jours** (avec leurs indices et réponses).\n` +
                        `Utilise \`/archive old_mysteries confirmer:true jours:${jours}\` pour confirmer.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const beforeDate = getCleanupDate(jours);
            const result = deleteOldMysteryGames({ beforeDate });

            await interaction.reply({
                content: `🗑️ **${result.games} parties**, **${result.hints} indices** et **${result.guesses} réponses** supprimés (terminés depuis +${jours} jours).`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /archive old_temp_roles
        if (subcommand === "old_temp_roles") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut nettoyer les données.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const confirmer = interaction.options.getBoolean("confirmer");
            const jours = interaction.options.getInteger("jours") ?? 30;

            if (!confirmer) {
                await interaction.reply({
                    content: `⚠️ **Attention** : Cette commande supprimera l’historique des rôles temporaires **retirés depuis plus de ${jours} jours**.\n` +
                        `Utilise \`/archive old_temp_roles confirmer:true jours:${jours}\` pour confirmer.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const beforeDate = getCleanupDate(jours);
            const result = deleteOldRemovedTemporaryRoles({ beforeDate });

            await interaction.reply({
                content: `🗑️ **${result.temporaryRoles} rôles temporaires** supprimés de l’historique (retirés depuis +${jours} jours).`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /archive vacuum
        if (subcommand === "vacuum") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut optimiser la base.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const confirmer = interaction.options.getBoolean("confirmer");

            if (!confirmer) {
                await interaction.reply({
                    content: `⚠️ **Attention** : Cette commande optimise le fichier SQLite (réduit sa taille).\n` +
                        `Utilise \`/archive vacuum confirmer:true\` pour confirmer.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            vacuumDatabase();

            await interaction.reply({
                content: "✅ Base de données optimisée (VACUUM).",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /archive info
        if (subcommand === "info") {
            await interaction.reply({
                content:
                    `🗑️ **Commandes d’archive (nettoyage de la base de données)**\n\n` +
                    `Ces commandes permettent de supprimer les anciennes données pour éviter que la base ne devienne trop grosse.\n\n` +
                    `**Disponibles :**\n` +
                    `- **/archive old_drops** : Supprime les Drop Events terminés depuis X jours.\n` +
                    `- **/archive old_rumors** : Supprime les rumeurs refusées depuis X jours.\n` +
                    `- **/archive old_mysteries** : Supprime les parties Membre Mystère terminées depuis X jours.\n` +
                    `- **/archive old_temp_roles** : Supprime l’historique des rôles temporaires retirés depuis X jours.\n` +
                    `- **/archive vacuum** : Optimise le fichier SQLite après nettoyage.\n\n` +
                    `⚠️ **Toutes ces commandes nécessitent une confirmation (` +
                    `**confirmer:true**` +
                    `) et sont réservées au staff.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }
}

/* =========================
   ÉCOUTEURS D'ÉVÉNEMENTS
========================= */

// Quand le bot est prêt.
client.once(Events.ClientReady, (c) => {
    console.log(`✅ Bot connecté en tant que ${c.user.tag} (ID: ${c.user.id})`);

    // Nettoie les rôles temporaires expirés au démarrage.
    cleanupExpiredTemporaryRoles(c).catch(console.error);

    // Lance les tâches planifiées.
    // 1. Nettoyage des rôles temporaires toutes les 10 minutes.
    cron.schedule("*/10 * * * *", () => {
        cleanupExpiredTemporaryRoles(c).catch(console.error);
    });

    // 2. Publication des indices Membre Mystère (ex: tous les mercredis à 18h et vendredis à 18h).
    // Exemple : tous les jours à 18h pour l'indice 1, 19h pour l'indice 2, etc.
    // À adapter selon ton planning.
    cron.schedule("0 18 * * 3,5", () => { // Mercredi et vendredi à 18h
        const guildIds = client.guilds.cache.map(g => g.id);
        guildIds.forEach(guildId => {
            publishMysteryHint(c, guildId, 1).catch(console.error);
        });
    });

    cron.schedule("0 19 * * 3,5", () => { // Mercredi et vendredi à 19h
        const guildIds = client.guilds.cache.map(g => g.id);
        guildIds.forEach(guildId => {
            publishMysteryHint(c, guildId, 2).catch(console.error);
        });
    });

    // 3. Rappel de révélation du Membre Mystère (ex: le samedi à 20h).
    cron.schedule("0 20 * * 6", () => { // Samedi à 20h
        const guildIds = client.guilds.cache.map(g => g.id);
        guildIds.forEach(guildId => {
            sendMysteryRevealReminder(c, guildId).catch(console.error);
        });
    });

    // 4. Vérifie les rappels de bump toutes les heures.
    cron.schedule("0 * * * *", () => {
        const guildIds = client.guilds.cache.map(g => g.id);
        guildIds.forEach(guildId => {
            checkScheduledBumpReminder(c, guildId).catch(console.error);
        });
    });
});

// Quand une interaction est reçue (commandes slash ou boutons).
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.guild) {
        await replyError(interaction, "Cette commande ne fonctionne que dans un serveur.");
        return;
    }

    // Gère les commandes slash.
    if (interaction.isChatInputCommand()) {
        try {
            await handleCommandInteraction(interaction);
        } catch (error) {
            console.error("Erreur dans une commande slash :", error);
            await replyError(interaction, "Une erreur est survenue pendant l'exécution de la commande.");
        }
        return;
    }

    // Gère les clics sur les boutons.
    if (interaction.isButton()) {
        try {
            await handleButtonInteraction(interaction);
        } catch (error) {
            console.error("Erreur dans un handler de bouton :", error);
            await replyError(interaction, "Une erreur est survenue pendant le traitement du bouton.");
        }
        return;
    }
});

// Quand un message est envoyé (pour détecter les bumps DISBOARD).
client.on(Events.MessageCreate, async (message) => {
    try {
        await handleDisboardBumpMessage(message);
    } catch (error) {
        console.error("Erreur dans le handler de message :", error);
    }
});

// Connexion du bot.
client.login(process.env.DISCORD_TOKEN).catch(console.error);
