// Charge les variables du fichier .env.
// Exemple : DISCORD_TOKEN, GUILD_ID, CLIENT_ID, GRAND_MASTER_ROLE_ID.
require("dotenv").config();

// Module Node natif pour manipuler les fichiers.
// Ici utilisé pour vérifier/exporter la base SQLite.
const fs = require("node:fs");

// Module Node natif pour créer des chemins de fichiers propres selon l’OS.
const path = require("node:path");

// Librairie qui permet de lancer des tâches automatiques selon un planning.
// Ici utilisée pour nettoyer les rôles temporaires et publier les indices Membre Mystère.
const cron = require("node-cron");

// Imports principaux de discord.js.
const {
    // Client = le bot Discord lui-même.
    Client,

    // GatewayIntentBits = les autorisations de lecture d’événements Discord.
    GatewayIntentBits,

    // Events = noms officiels des événements Discord, comme ClientReady ou InteractionCreate.
    Events,

    // PermissionFlagsBits = permet de vérifier les permissions Discord d’un membre.
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

    // AttachmentBuilder = permet d’envoyer un fichier, utilisé pour /backup export.
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

        // Utile si plus tard tu veux exploiter l’activité vocale.
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

const SHOP_ITEMS = {
    titre_temporaire: {
        name: "Titre temporaire",
        price: 5,
        description: "Demande un petit titre/rôle temporaire fun pendant quelques jours."
    },
    nomination_gazette: {
        name: "Nomination Gazette",
        price: 8,
        description: "Propose une nomination drôle pour la prochaine Gazette Royale BDL."
    },
    theme_gazette: {
        name: "Thème de Gazette",
        price: 10,
        description: "Propose le thème principal d’une prochaine Gazette."
    },
    mini_drop: {
        name: "Mini-drop personnalisé",
        price: 15,
        description: "Demande au staff de lancer un petit drop fun."
    },
    interview_gazette: {
        name: "Interview Gazette",
        price: 20,
        description: "Achète une mini-interview dans la Gazette."
    },
    quete_personnalisee: {
        name: "Quête personnalisée",
        price: 25,
        description: "Propose une quête spéciale à faire apparaître au tableau de la Guilde."
    }
};

function formatShopItemList() {
    return Object.entries(SHOP_ITEMS)
        .map(([key, item]) => {
            return `**${item.name}** — **${item.price} point(s)**\n${item.description}\n\`/boutique acheter item:${key} note:...\``;
        })
        .join("\n\n");
}

// Ajoute un nombre de jours à une date.
// Sert pour calculer l’expiration des rôles temporaires.
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

// Retire un nombre de jours à une date.
// Sert pour les commandes d’archive/nettoyage.
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
// Exemple : jours = 30 → date d’il y a 30 jours.
function getCleanupDate(days) {
    return subtractDays(new Date(), days).toISOString();
}

// Formate la taille d’un fichier.
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

// Fonction d’erreur propre.
// Si une commande plante, le bot essaie quand même de répondre à l’utilisateur.
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
        console.error("Impossible d’envoyer le message d’erreur :", error);
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
        .setLabel("Approuver l’achat")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success);

    const rejectButton = new ButtonBuilder()
        .setCustomId(`shop_reject_${purchaseId}`)
        .setLabel("Refuser l’achat")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Danger);

    return new ActionRowBuilder().addComponents(approveButton, rejectButton);
}

function createDisabledShopPurchaseButtons(purchaseId) {
    const approveButton = new ButtonBuilder()
        .setCustomId(`shop_approve_${purchaseId}`)
        .setLabel("Approuver l’achat")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success)
        .setDisabled(true);

    const rejectButton = new ButtonBuilder()
        .setCustomId(`shop_reject_${purchaseId}`)
        .setLabel("Refuser l’achat")
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
                ).catch(() => null);

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
    // Si la personne a déjà participé, SQLite déclenche une erreur à cause du UNIQUE.
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
        ).catch(() => null);

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
        ...message.embeds.map(embed => {
            return [
                embed.title ?? "",
                embed.description ?? "",
                ...(embed.fields ?? []).map(field => `${field.name} ${field.value}`)
            ].join(" ");
        })
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

            const warning = staffChannelId
                ? ""
                : "\n⚠️ Aucun salon staff n’est configuré. Le staff devra utiliser `/rumeur liste`.";

            await interaction.reply({
                content:
                    `💬 Ta rumeur a été envoyée au staff.\n` +
                    `ID : **#${rumorId}**\n` +
                    `Elle devra être approuvée avant d’apparaître dans la Gazette.` +
                    warning,
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /rumeur liste
        if (subcommand === "liste") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut consulter la liste des rumeurs.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const statut = interaction.options.getString("statut") ?? "pending";

            const rumors = getRumorsByStatus({
                guildId: interaction.guildId,
                status: statut,
                limit: 10
            });

            if (rumors.length === 0) {
                await interaction.reply({
                    content: `📭 Aucune rumeur avec le statut : **${statut}**.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const lines = rumors.map(rumor => {
                const auteur = rumor.anonymous ? "Anonyme" : `<@${rumor.author_id}>`;
                const cibleTexte = rumor.target_user_id
                    ? ` | Cible : <@${rumor.target_user_id}>`
                    : "";

                return (
                    `**#${rumor.id}** — ${auteur}${cibleTexte}\n` +
                    `> ${rumor.content}`
                );
            });

            await interaction.reply({
                content: `📋 **Rumeurs — ${statut}**\n\n${lines.join("\n\n")}`,
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /rumeur approuver
        if (subcommand === "approuver") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut approuver une rumeur.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const id = interaction.options.getInteger("id");

            const rumor = getRumorById({
                guildId: interaction.guildId,
                rumorId: id
            });

            if (!rumor) {
                await interaction.reply({
                    content: `❌ Aucune rumeur trouvée avec l’ID **#${id}**.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            updateRumorStatus({
                guildId: interaction.guildId,
                rumorId: id,
                status: "approved",
                reviewedBy: interaction.user.id
            });

            await interaction.reply({
                content:
                    `✅ Rumeur **#${id}** approuvée.\n\n` +
                    `> ${rumor.content}`,
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /rumeur refuser
        if (subcommand === "refuser") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut refuser une rumeur.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const id = interaction.options.getInteger("id");
            const raison = interaction.options.getString("raison") ?? "Aucune raison indiquée.";

            const rumor = getRumorById({
                guildId: interaction.guildId,
                rumorId: id
            });

            if (!rumor) {
                await interaction.reply({
                    content: `❌ Aucune rumeur trouvée avec l’ID **#${id}**.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            updateRumorStatus({
                guildId: interaction.guildId,
                rumorId: id,
                status: "rejected",
                reviewedBy: interaction.user.id,
                reviewReason: raison
            });

            await interaction.reply({
                content:
                    `❌ Rumeur **#${id}** refusée.\n` +
                    `Raison : ${raison}`,
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

            const rumors = getRumorsByStatus({
                guildId: interaction.guildId,
                status: "approved",
                limit: 5
            });

            const leaderboard = getLeaderboard({
                guildId: interaction.guildId,
                includeSecret: false,
                limit: 5
            });

            const rumorsText =
                rumors.length > 0
                    ? rumors
                        .map(rumor => {
                            const auteur = rumor.anonymous ? "Anonyme" : `<@${rumor.author_id}>`;
                            const cible = rumor.target_user_id
                                ? ` — cible : <@${rumor.target_user_id}>`
                                : "";
                            return `**#${rumor.id}** — ${auteur}${cible}\n> ${truncate(rumor.content, 250)}`;
                        })
                        .join("\n\n")
                    : "Aucune rumeur approuvée pour l’instant.";

            const leaderboardText =
                leaderboard.length > 0
                    ? leaderboard
                        .map((row, index) => {
                            return `**${index + 1}.** <@${row.user_id}> — **${row.total} point(s)**`;
                        })
                        .join("\n")
                    : "Aucun point public pour l’instant.";

            const embed = new EmbedBuilder()
                .setTitle("📰 Brouillon Gazette BDL")
                .setDescription(
                    "Base automatique pour préparer la Gazette de la semaine.\n" +
                    "Le staff peut copier, modifier et publier la version finale."
                )
                .addFields(
                    {
                        name: "💬 Rumeurs approuvées",
                        value: truncate(rumorsText, 1000)
                    },
                    {
                        name: "🏆 Top points publics",
                        value: truncate(leaderboardText, 1000)
                    },
                    {
                        name: "📊 Stats absurdes à compléter",
                        value:
                            "— Nombre de débats inutiles : [à remplir]\n" +
                            "— Nombre de mdrrrr : [à remplir]\n" +
                            "— Nombre de ragequits : [à remplir]\n" +
                            "— Temps passé en vocal : [à remplir]"
                    },
                    {
                        name: "📝 Structure conseillée",
                        value:
                            "1. Titre absurde de la semaine\n" +
                            "2. Pépites de la semaine\n" +
                            "3. Rumeurs\n" +
                            "4. Stats absurdes\n" +
                            "5. Exploit de la semaine\n" +
                            "6. Nominations"
                    }
                )
                .setFooter({
                    text: "Gazette BDL — brouillon automatique"
                })
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });

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

            const gazetteChannelId = getSetting({
                guildId: interaction.guildId,
                key: "gazette_channel_id"
            });

            if (!gazetteChannelId) {
                await interaction.reply({
                    content:
                        "❌ Aucun salon Gazette configuré.\n" +
                        "Utilise : `/config salon type:Gazette salon:#ton-salon`",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const channel = await interaction.guild.channels
                .fetch(gazetteChannelId)
                .catch(() => null);

            if (!channel || !channel.isTextBased()) {
                await interaction.reply({
                    content: "❌ Salon Gazette introuvable ou invalide.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const titre = interaction.options.getString("titre");
            const pepites = interaction.options.getString("pepites");
            const stats = interaction.options.getString("stats");
            const rumeur = interaction.options.getString("rumeur");
            const exploit = interaction.options.getString("exploit");
            const nominations =
                interaction.options.getString("nominations") ??
                "Aucune nomination cette semaine. Le chaos n’a pas encore choisi ses élus.";
            const banniere = interaction.options.getAttachment("banniere");

            const embed = new EmbedBuilder()
                .setTitle("╭━━━ 📰 Gazette BDL ━━━╮")
                .setDescription(`## ${truncate(titre, 200)}\n\n✦ Le journal officiel du chaos organisé ✦`)
                .setColor(0xf1c40f)
                .addFields(
                    {
                        name: "💎 Les pépites de la semaine",
                        value: formatMultilineInput(pepites, 1000)
                    },
                    {
                        name: "📊 Stats absurdes",
                        value: formatMultilineInput(stats, 1000)
                    },
                    {
                        name: "🕵️ Rumeur de la semaine",
                        value: formatMultilineInput(rumeur, 1000)
                    },
                    {
                        name: "🏆 Exploit de la semaine",
                        value: formatMultilineInput(exploit, 1000)
                    },
                    {
                        name: "👑 Nominations",
                        value: formatMultilineInput(nominations, 1000)
                    }
                )
                .setFooter({
                    text: `Gazette publiée par ${interaction.user.username} • BDL Newsroom`
                })
                .setTimestamp();

            applyAttachmentImage(embed, banniere);

            await channel.send({
                content: "📰 **Nouvelle Gazette BDL disponible !**",
                embeds: [embed]
            });

            await interaction.reply({
                content: `✅ Gazette publiée dans ${channel}.`,
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

        if (!isStaff(interaction.member)) {
            await interaction.reply({
                content: "❌ Seul le staff peut modifier la configuration du bot.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /config salon
        if (subcommand === "salon") {
            const type = interaction.options.getString("type");
            const channel = interaction.options.getChannel("salon");

            setSetting({
                guildId: interaction.guildId,
                key: type,
                value: channel.id
            });

            await interaction.reply({
                content: `✅ Salon configuré : **${type}** → ${channel}`,
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /config role_staff
        if (subcommand === "role_staff") {
            const role = interaction.options.getRole("role");

            setSetting({
                guildId: interaction.guildId,
                key: "staff_role_id",
                value: role.id
            });

            await interaction.reply({
                content:
                    `✅ Rôle staff configuré : ${role}\n\n` +
                    `Les membres avec ce rôle pourront utiliser les commandes staff BDL.`,
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /config role_bump
        if (subcommand === "role_bump") {
            const role = interaction.options.getRole("role");

            setSetting({
                guildId: interaction.guildId,
                key: "bump_role_id",
                value: role.id
            });

            await interaction.reply({
                content:
                    `✅ Rôle bump configuré : ${role}\n\n` +
                    `Les membres avec ce rôle seront ping lors des rappels de bump.`,
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /config voir
        if (subcommand === "voir") {
            const settings = getAllSettings({
                guildId: interaction.guildId
            });

            if (settings.length === 0) {
                await interaction.reply({
                    content: "⚙️ Aucun salon ou rôle n’est encore configuré.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const lines = settings.map(setting => {
                if (setting.key.endsWith("_role_id")) {
                    return `**${setting.key}** → <@&${setting.value}>`;
                }

                return `**${setting.key}** → <#${setting.value}>`;
            });

            await interaction.reply({
                content: `⚙️ **Configuration actuelle du bot BDL**\n\n${lines.join("\n")}`,
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
                    content: "❌ Seul le staff peut publier une quête.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const titre = interaction.options.getString("titre");
            const description = interaction.options.getString("description");
            const points = interaction.options.getInteger("points") ?? 1;
            const role = interaction.options.getRole("role");
            const joursRole = interaction.options.getInteger("jours_role");
            const image = interaction.options.getAttachment("image");

            const questId = addQuest({
                guildId: interaction.guildId,
                title: titre,
                description,
                rewardPoints: points,
                rewardRoleId: role ? role.id : null,
                rewardRoleDays: role ? (joursRole ?? 7) : null,
                createdBy: interaction.user.id
            });

            const questsChannelId = getSetting({
                guildId: interaction.guildId,
                key: "quests_channel_id"
            });

            const embed = new EmbedBuilder()
                .setTitle(`🎯 Nouvelle quête disponible #${questId}`)
                .setDescription("✦ Une nouvelle mission vient d’être affichée au tableau de la Guilde BDL. ✦")
                .setColor(0x1f3a5f)
                .addFields(
                    {
                        name: "📜 Objectif",
                        value: `**${titre}**\n${description}`,
                        inline: false
                    },
                    {
                        name: "🎁 Récompense",
                        value:
                            `+${points} point(s)` +
                            (
                                role
                                    ? ` + rôle ${role} pendant **${joursRole ?? 7} jour(s)**`
                                    : ""
                            ),
                        inline: false
                    },
                    {
                        name: "✅ Validation",
                        value: `Utilise \`/quete valider id:${questId} preuve:...\``,
                        inline: false
                    }
                )
                .setFooter({
                    text: `Quête créée par ${interaction.user.username}`
                })
                .setTimestamp();

            applyAttachmentImage(embed, image);

            if (questsChannelId) {
                const questsChannel = await interaction.guild.channels
                    .fetch(questsChannelId)
                    .catch(() => null);

                if (questsChannel && questsChannel.isTextBased()) {
                    await questsChannel.send({ embeds: [embed] });

                    await interaction.reply({
                        content: `✅ Quête #${questId} publiée dans ${questsChannel}.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
            }

            await interaction.reply({
                content:
                    `✅ Quête #${questId} créée, mais aucun salon quêtes n’est configuré.\n` +
                    `Utilise \`/config salon type:Quêtes salon:#ton-salon\`.`,
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /quete liste
        if (subcommand === "liste") {
            const quests = getActiveQuests({
                guildId: interaction.guildId,
                limit: 10
            });

            if (quests.length === 0) {
                await interaction.reply({
                    content: "📭 Aucune quête active pour le moment.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const lines = quests.map(quest => {
                const roleText = quest.reward_role_id
                    ? ` + <@&${quest.reward_role_id}> pendant ${quest.reward_role_days ?? 7} jour(s)`
                    : "";

                return (
                    `**#${quest.id} — ${quest.title}**\n` +
                    `${quest.description}\n` +
                    `Récompense : **+${quest.reward_points} point(s)**${roleText}`
                );
            });

            await interaction.reply({
                content: `🎯 **Quêtes actives**\n\n${lines.join("\n\n")}`,
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /quete valider
        if (subcommand === "valider") {
            const questId = interaction.options.getInteger("id");
            const preuve = interaction.options.getString("preuve");
            const photo = interaction.options.getAttachment("photo");
            const membreMentionne = interaction.options.getUser("membre_mentionne");
            const lien = interaction.options.getString("lien");

            const quest = getQuestById({
                guildId: interaction.guildId,
                questId
            });

            if (!quest || quest.status !== "active") {
                await interaction.reply({
                    content: `❌ Aucune quête active trouvée avec l’ID #${questId}.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            let submissionId;

            try {
                submissionId = addQuestSubmission({
                    guildId: interaction.guildId,
                    questId,
                    userId: interaction.user.id,
                    proof: preuve,
                    proofImageUrl: photo ? photo.url : null,
                    mentionedUserId: membreMentionne ? membreMentionne.id : null,
                    proofLink: lien
                });
            } catch (error) {
                await interaction.reply({
                    content: "⚠️ Tu as déjà demandé la validation de cette quête.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const staffChannelId =
                getSetting({
                    guildId: interaction.guildId,
                    key: "quests_staff_channel_id"
                }) ||
                getSetting({
                    guildId: interaction.guildId,
                    key: "rumors_staff_channel_id"
                });

            if (staffChannelId) {
                const staffChannel = await interaction.guild.channels
                    .fetch(staffChannelId)
                    .catch(() => null);

                if (staffChannel && staffChannel.isTextBased()) {
                    const embed = new EmbedBuilder()
                        .setTitle("╭━━━ 🎯 Preuve de quête ━━━╮")
                        .setDescription(`**Preuve envoyée :**\n${truncate(preuve, 1000)}`)
                        .setColor(0x2ecc71)
                        .addFields(
                            {
                                name: "🆔 ID validation",
                                value: `#${submissionId}`,
                                inline: true
                            },
                            {
                                name: "🎯 Quête",
                                value: `#${quest.id} — ${quest.title}`,
                                inline: false
                            },
                            {
                                name: "👤 Membre",
                                value: `${interaction.user}`,
                                inline: true
                            },
                            {
                                name: "📌 Membre mentionné",
                                value: membreMentionne ? `${membreMentionne}` : "Aucun",
                                inline: true
                            },
                            {
                                name: "🔗 Lien",
                                value: lien ? truncate(lien, 300) : "Aucun",
                                inline: false
                            },
                            {
                                name: "🏅 Récompense",
                                value:
                                    `+${quest.reward_points} point(s)` +
                                    (
                                        quest.reward_role_id
                                            ? ` + <@&${quest.reward_role_id}> pendant ${quest.reward_role_days ?? 7} jour(s)`
                                            : ""
                                    ),
                                inline: false
                            },
                            {
                                name: "⏳ Statut",
                                value: "En attente de validation",
                                inline: true
                            }
                        )
                        .setFooter({
                            text: "Clique sur ✅ Approuver ou ❌ Refuser."
                        })
                        .setTimestamp();

                    if (photo) {
                        embed.setImage(photo.url);
                    }

                    await staffChannel.send({
                        embeds: [embed],
                        components: [createQuestSubmissionButtons(submissionId)]
                    });
                }
            }

            await interaction.reply({
                content:
                    `✅ Ta demande de validation a été envoyée au staff.\n` +
                    `ID validation : **#${submissionId}**` +
                    (photo ? "\n📸 Photo ajoutée à ta preuve." : "") +
                    (membreMentionne ? `\n📌 Membre mentionné : ${membreMentionne}` : ""),
                flags: MessageFlags.Ephemeral
            });

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

            const statut = interaction.options.getString("statut") ?? "pending";

            const submissions = getQuestSubmissionsByStatus({
                guildId: interaction.guildId,
                status: statut,
                limit: 10
            });

            if (submissions.length === 0) {
                await interaction.reply({
                    content: `📭 Aucune validation de quête avec le statut : **${statut}**.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const lines = submissions.map(submission => {
                return (
                    `**#${submission.id}** — <@${submission.user_id}>\n` +
                    `Quête : **#${submission.quest_id} — ${submission.quest_title}**\n` +
                    `Preuve : ${truncate(submission.proof, 250)}`
                );
            });

            await interaction.reply({
                content: `📋 **Validations de quêtes — ${statut}**\n\n${lines.join("\n\n")}`,
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /quete approuver
        if (subcommand === "approuver") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut approuver une quête.",
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

            if (submission.status !== "pending") {
                await interaction.reply({
                    content: `⚠️ Cette validation a déjà été traitée. Statut : **${submission.status}**.`,
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
                    const roleDays = submission.reward_role_days ?? 7;
                    const expiresAt = addDays(new Date(), roleDays);

                    await member.roles.add(
                        submission.reward_role_id,
                        `Rôle temporaire obtenu via quête : ${submission.quest_title}`
                    ).catch(() => null);

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
                content:
                    `✅ Validation #${submissionId} approuvée.\n` +
                    `<@${submission.user_id}> gagne **+${submission.reward_points} point(s)**.` +
                    (
                        submission.reward_role_id
                            ? `\nRôle donné : <@&${submission.reward_role_id}> pendant **${submission.reward_role_days ?? 7} jour(s)**.`
                            : ""
                    ),
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /quete refuser
        if (subcommand === "refuser") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut refuser une quête.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const submissionId = interaction.options.getInteger("id");
            const raison = interaction.options.getString("raison") ?? "Aucune raison indiquée.";

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
                    content: `⚠️ Cette validation a déjà été traitée. Statut : **${submission.status}**.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            updateQuestSubmissionStatus({
                guildId: interaction.guildId,
                submissionId,
                status: "rejected",
                reviewedBy: interaction.user.id,
                reviewReason: raison
            });

            await interaction.reply({
                content:
                    `❌ Validation #${submissionId} refusée.\n` +
                    `Raison : ${raison}`,
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /quete fermer
        if (subcommand === "fermer") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut fermer une quête.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const questId = interaction.options.getInteger("id");

            const quest = getQuestById({
                guildId: interaction.guildId,
                questId
            });

            if (!quest) {
                await interaction.reply({
                    content: `❌ Aucune quête trouvée avec l’ID #${questId}.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            closeQuest({
                guildId: interaction.guildId,
                questId
            });

            await interaction.reply({
                content: `🔒 Quête #${questId} fermée : **${quest.title}**.`,
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

        if (!isStaff(interaction.member)) {
            await interaction.reply({
                content: "❌ Seul le staff peut gérer les rôles temporaires.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /role temporaire
        if (subcommand === "temporaire") {
            const user = interaction.options.getUser("membre");
            const role = interaction.options.getRole("role");
            const jours = interaction.options.getInteger("jours");
            const raison =
                interaction.options.getString("raison") ??
                "Rôle temporaire BDL";

            const member = await interaction.guild.members
                .fetch(user.id)
                .catch(() => null);

            if (!member) {
                await interaction.reply({
                    content: "❌ Membre introuvable sur ce serveur.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const botMember = await interaction.guild.members
                .fetchMe()
                .catch(() => null);

            if (!botMember) {
                await interaction.reply({
                    content: "❌ Impossible de vérifier les permissions du bot.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (role.managed) {
                await interaction.reply({
                    content: "❌ Ce rôle est géré par une intégration/bot et ne peut pas être donné manuellement.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            if (role.position >= botMember.roles.highest.position) {
                await interaction.reply({
                    content:
                        "❌ Le rôle du bot est trop bas dans la hiérarchie.\n" +
                        "Va dans Paramètres du serveur → Rôles, puis place le rôle du bot au-dessus du rôle à donner.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const expiresAt = addDays(new Date(), jours);

            await member.roles.add(role, raison);

            const tempRoleId = addTemporaryRole({
                guildId: interaction.guildId,
                userId: user.id,
                roleId: role.id,
                reason: raison,
                expiresAt: formatDateForDatabase(expiresAt),
                createdBy: interaction.user.id
            });

            await interaction.reply({
                content:
                    `✅ Rôle temporaire donné.\n\n` +
                    `Membre : ${user}\n` +
                    `Rôle : ${role}\n` +
                    `Durée : **${jours} jour(s)**\n` +
                    `Expire le : **${expiresAt.toLocaleString("fr-FR")}**\n` +
                    `Raison : ${raison}\n` +
                    `ID temporaire : **#${tempRoleId}**`,
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /role liste
        if (subcommand === "liste") {
            const roles = getActiveTemporaryRoles({
                guildId: interaction.guildId,
                limit: 20
            });

            if (roles.length === 0) {
                await interaction.reply({
                    content: "📭 Aucun rôle temporaire actif.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const lines = roles.map(tempRole => {
                const expiresAt = new Date(tempRole.expires_at);

                return (
                    `**#${tempRole.id}** — <@${tempRole.user_id}> possède <@&${tempRole.role_id}>\n` +
                    `Expire : **${expiresAt.toLocaleString("fr-FR")}**\n` +
                    `Raison : ${tempRole.reason ?? "Aucune raison"}`
                );
            });

            await interaction.reply({
                content: `🎭 **Rôles temporaires actifs**\n\n${lines.join("\n\n")}`,
                flags: MessageFlags.Ephemeral
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

            const launchEmbed = new EmbedBuilder()
                .setTitle("🕵️ Membre Mystère")
                .setDescription(
                    "Une silhouette rôde dans le serveur...\n\n" +
                    "📁 Le Bureau des enquêtes BDL ouvre un nouveau dossier."
                )
                .setColor(0x143d2a)
                .addFields(
                    {
                        name: "❓ Proposition",
                        value: "Utilise `/mystere guess membre:@membre`."
                    },
                    {
                        name: "⚠️ Règle importante",
                        value: "Une seule proposition par jour et par membre."
                    }
                )
                .setFooter({ text: `BDL Investigation Department • ${semaine}` })
                .setTimestamp();

            applyAttachmentImage(launchEmbed, image);

            const mysteryChannelId = getSetting({
                guildId: interaction.guildId,
                key: "mystery_channel_id"
            });

            if (mysteryChannelId) {
                const channel = await interaction.guild.channels
                    .fetch(mysteryChannelId)
                    .catch(() => null);

                if (channel && channel.isTextBased()) {
                    await channel.send({ embeds: [launchEmbed] });
                }
            }

            await interaction.reply({
                content:
                    `🕵️ Membre Mystère configuré pour **${semaine}**.\n` +
                    `ID partie : **#${gameId}**\n` +
                    `Membre secret : ${membre}\n\n` +
                    `Ajoute les indices avec :\n` +
                    `\`/mystere indice numero:1 texte:...\``,
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /mystere indice
        if (subcommand === "indice") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut ajouter ou publier un indice.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const game = getActiveMysteryGame({
                guildId: interaction.guildId
            });

            if (!game) {
                await interaction.reply({
                    content: "❌ Aucun Membre Mystère actif. Utilise d’abord `/mystere set`.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const numero = interaction.options.getInteger("numero");
            const texte = interaction.options.getString("texte");
            const publier = interaction.options.getBoolean("publier") ?? false;

            addMysteryHint({
                guildId: interaction.guildId,
                gameId: game.id,
                hintNumber: numero,
                content: texte
            });

            if (!publier) {
                await interaction.reply({
                    content:
                        `✅ Indice **#${numero}** enregistré pour le Membre Mystère.\n` +
                        `Il n’a pas encore été publié.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const mysteryChannelId = getSetting({
                guildId: interaction.guildId,
                key: "mystery_channel_id"
            });

            if (!mysteryChannelId) {
                await interaction.reply({
                    content:
                        "❌ Aucun salon Membre Mystère configuré.\n" +
                        "Utilise `/config salon type:Membre Mystère salon:#ton-salon`.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const channel = await interaction.guild.channels
                .fetch(mysteryChannelId)
                .catch(() => null);

            if (!channel || !channel.isTextBased()) {
                await interaction.reply({
                    content: "❌ Salon Membre Mystère introuvable ou invalide.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle(`🕵️ Membre Mystère — Indice #${numero}`)
                .setDescription(texte)
                .setFooter({
                    text: "Faites vos propositions avec /mystere guess"
                })
                .setTimestamp();

            await channel.send({ embeds: [embed] });

            markMysteryHintPublished({
                guildId: interaction.guildId,
                gameId: game.id,
                hintNumber: numero
            });

            await interaction.reply({
                content: `✅ Indice #${numero} publié dans ${channel}.`,
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /mystere guess
        if (subcommand === "guess") {
            const game = getActiveMysteryGame({
                guildId: interaction.guildId
            });

            if (!game) {
                await interaction.reply({
                    content: "❌ Aucun Membre Mystère actif pour le moment.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const alreadyGuessedToday = hasMysteryGuessToday({
                guildId: interaction.guildId,
                gameId: game.id,
                userId: interaction.user.id
            });

            if (alreadyGuessedToday) {
                await interaction.reply({
                    content:
                        "⏳ Tu as déjà fait une proposition aujourd’hui.\n" +
                        "Reviens demain pour continuer l’enquête 🕵️",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const guessedMember = interaction.options.getUser("membre");
            const isCorrect = guessedMember.id === game.target_user_id;

            addMysteryGuess({
                guildId: interaction.guildId,
                gameId: game.id,
                userId: interaction.user.id,
                guessedUserId: guessedMember.id,
                isCorrect
            });

            if (isCorrect) {
                const winners = getTopCorrectMysteryGuessers({
                    guildId: interaction.guildId,
                    gameId: game.id,
                    limit: 3
                });

                const place = winners.findIndex(winner => winner.user_id === interaction.user.id) + 1;
                const placeText = place === 1 ? "🥇 1ère place" : place === 2 ? "🥈 2e place" : place === 3 ? "🥉 3e place" : "bonne réponse";

                await interaction.reply({
                    content:
                        `✅ Tu as trouvé le Membre Mystère !\n` +
                        `Classement provisoire : **${placeText}**.\n` +
                        `La révélation officielle aura lieu dimanche.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await interaction.reply({
                content:
                    `❌ Ce n’est pas ${guessedMember}.\n` +
                    `Continue l’enquête. Tu pourras refaire une proposition demain 🕵️`,
                flags: MessageFlags.Ephemeral
            });

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

            const game = getActiveMysteryGame({
                guildId: interaction.guildId
            });

            if (!game) {
                await interaction.reply({
                    content: "❌ Aucun Membre Mystère actif à révéler.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const winners = getTopCorrectMysteryGuessers({
                guildId: interaction.guildId,
                gameId: game.id,
                limit: 3
            });

            const winnerUserId = winners.length > 0 ? winners[0].user_id : null;

            revealMysteryGame({
                guildId: interaction.guildId,
                gameId: game.id,
                winnerUserId
            });

            if (winners.length > 0) {
                const rewards = [3, 2, 1];

                for (let index = 0; index < winners.length; index++) {
                    addPoints({
                        guildId: interaction.guildId,
                        userId: winners[index].user_id,
                        amount: rewards[index],
                        reason: `Membre Mystère — place #${index + 1}`,
                        isSecret: false,
                        createdBy: interaction.user.id
                    });
                }
            } else {
                addPoints({
                    guildId: interaction.guildId,
                    userId: game.target_user_id,
                    amount: 1,
                    reason: "Membre Mystère non découvert",
                    isSecret: false,
                    createdBy: interaction.user.id
                });
            }

            const mysteryChannelId = getSetting({
                guildId: interaction.guildId,
                key: "mystery_channel_id"
            });

            const hints = getMysteryHints({
                guildId: interaction.guildId,
                gameId: game.id
            });

            const hintsText =
                hints.length > 0
                    ? hints
                        .map(hint => `**Indice ${hint.hint_number} :** ${hint.content}`)
                        .join("\n")
                    : "Aucun indice enregistré.";

            const rewards = [3, 2, 1];
            const revealText =
                winners.length > 0
                    ? winners
                        .map((winner, index) => {
                            const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
                            return `${medal} <@${winner.user_id}> — **+${rewards[index]} point(s)**`;
                        })
                        .join("\n")
                    : `Personne n’a trouvé. <@${game.target_user_id}> gagne **+1 point bonus** pour avoir survécu aux accusations.`;

            const embed = new EmbedBuilder()
                .setTitle("🕵️ Révélation du Membre Mystère")
                .setDescription(
                    `Le Membre Mystère était…\n\n` +
                    `# <@${game.target_user_id}>`
                )
                .addFields(
                    {
                        name: "Indices",
                        value: truncate(hintsText, 1000)
                    },
                    {
                        name: "Résultat",
                        value: revealText
                    }
                )
                .setFooter({
                    text: "BDL Investigation Department"
                })
                .setTimestamp();

            if (mysteryChannelId) {
                const channel = await interaction.guild.channels
                    .fetch(mysteryChannelId)
                    .catch(() => null);

                if (channel && channel.isTextBased()) {
                    await channel.send({ embeds: [embed] });

                    await interaction.reply({
                        content: `✅ Membre Mystère révélé dans ${channel}.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
            }

            await interaction.reply({
                content: "✅ Membre Mystère révélé.",
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /mystere statut
        if (subcommand === "statut") {
            const game = getActiveMysteryGame({
                guildId: interaction.guildId
            });

            if (!game) {
                await interaction.reply({
                    content: "📭 Aucun Membre Mystère actif.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const hints = getMysteryHints({
                guildId: interaction.guildId,
                gameId: game.id
            });

            const publishedHints = hints.filter(hint => hint.published === 1);

            if (isStaff(interaction.member)) {
                await interaction.reply({
                    content:
                        `🕵️ **Membre Mystère actif**\n\n` +
                        `Semaine : **${game.week_key}**\n` +
                        `Membre secret : <@${game.target_user_id}>\n` +
                        `Indices enregistrés : **${hints.length}**\n` +
                        `Indices publiés : **${publishedHints.length}**`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            await interaction.reply({
                content:
                    `🕵️ **Membre Mystère actif**\n\n` +
                    `Semaine : **${game.week_key}**\n` +
                    `Indices publiés : **${publishedHints.length}**\n` +
                    `Fais une proposition avec \`/mystere guess\`.`,
                flags: MessageFlags.Ephemeral
            });

            return;
        }
    }

    /* =========================
       DROP EVENT
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

            const titre =
                interaction.options.getString("titre") ??
                "Drop Event BDL";

            const maxWinners =
                interaction.options.getInteger("gagnants") ?? 5;

            const rewardPoints =
                interaction.options.getInteger("points") ?? 1;

            const eventsChannelId = getSetting({
                guildId: interaction.guildId,
                key: "events_channel_id"
            });

            const channel = eventsChannelId
                ? await interaction.guild.channels.fetch(eventsChannelId).catch(() => null)
                : interaction.channel;

            if (!channel || !channel.isTextBased()) {
                await interaction.reply({
                    content:
                        "❌ Aucun salon event valide.\n" +
                        "Configure-le avec `/config salon type:Events salon:#ton-salon`.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const dropId = createDropEvent({
                guildId: interaction.guildId,
                channelId: channel.id,
                title: titre,
                rewardPoints,
                maxWinners,
                createdBy: interaction.user.id
            });

            const isRainDrop = (process.env.BDL_DROP_STYLE || "coffre").toLowerCase() === "pluie";

            const embed = new EmbedBuilder()
                .setTitle(isRainDrop ? "💸 Pluie de points" : "🗝️ Coffre BDL ouvert")
                .setDescription(isRainDrop ? "Attrape les points avant les autres." : "Un trésor vient d’apparaître.")
                .setColor(isRainDrop ? 0x9b59b6 : 0xd4af37)
                .addFields(
                    {
                        name: "🏆 Récompense",
                        value: `+${rewardPoints} point(s)`,
                        inline: true
                    },
                    {
                        name: "👥 Places disponibles",
                        value: `${maxWinners} gagnant(s) maximum`,
                        inline: true
                    },
                    {
                        name: "⚡ Condition",
                        value: "Cliquer vite. Très vite.",
                        inline: false
                    }
                )
                .addFields({
                    name: "Participants",
                    value: "Aucun participant pour l’instant."
                })
                .setFooter({
                    text: `Drop Event #${dropId}`
                })
                .setTimestamp();

            applyAttachmentImage(embed, image);

            const message = await channel.send({
                embeds: [embed],
                components: [createDropButton(dropId)]
            });

            setDropMessageId({
                guildId: interaction.guildId,
                dropId,
                messageId: message.id
            });

            await interaction.reply({
                content: `✅ Drop Event #${dropId} lancé dans ${channel}.`,
                flags: MessageFlags.Ephemeral
            });

            return;
        }
    }

    /* =========================
       GRAND MAÎTRE
    ========================= */

    if (interaction.commandName === "grandmaitre") {
        const subcommand = interaction.options.getSubcommand();

        const now = new Date();
        const mois = interaction.options.getInteger("mois") ?? now.getMonth() + 1;
        const annee = interaction.options.getInteger("annee") ?? now.getFullYear();

        // /grandmaitre classement
        if (subcommand === "classement") {
            const inclureSecrets =
                interaction.options.getBoolean("secrets") ?? false;

            if (inclureSecrets && !isStaff(interaction.member)) {
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
                includeSecret: inclureSecrets,
                limit: 10
            });

            if (leaderboard.length === 0) {
                await interaction.reply({
                    content: `📭 Aucun point trouvé pour **${mois}/${annee}**.`,
                    flags: inclureSecrets ? MessageFlags.Ephemeral : undefined
                });
                return;
            }

            const lines = leaderboard.map((row, index) => {
                const crown = index === 0 ? " 👑" : "";
                return `**${index + 1}.** <@${row.user_id}> — **${row.total} point(s)**${crown}`;
            });

            await interaction.reply({
                content:
                    `🏆 **Classement Grand Maître — ${mois}/${annee}**` +
                    `${inclureSecrets ? " — secrets inclus" : ""}\n` +
                    `♻️ Ce classement repart automatiquement à zéro chaque mois pour le jeu Grand Maître.\n\n` +
                    lines.join("\n"),
                flags: inclureSecrets ? MessageFlags.Ephemeral : undefined
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

            const roleId = process.env.GRAND_MASTER_ROLE_ID;

            if (!roleId) {
                await interaction.reply({
                    content:
                        "❌ Aucun rôle Grand Maître configuré.\n" +
                        "Ajoute `GRAND_MASTER_ROLE_ID=...` dans ton fichier `.env`.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const leaderboard = getMonthlyLeaderboard({
                guildId: interaction.guildId,
                year: annee,
                month: mois,
                includeSecret: true,
                limit: 1
            });

            if (leaderboard.length === 0) {
                await interaction.reply({
                    content: `📭 Aucun point trouvé pour **${mois}/${annee}**.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const winner = leaderboard[0];

            const member = await interaction.guild.members
                .fetch(winner.user_id)
                .catch(() => null);

            if (!member) {
                await interaction.reply({
                    content: "❌ Le gagnant est introuvable sur le serveur.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const role = await interaction.guild.roles
                .fetch(roleId)
                .catch(() => null);

            if (!role) {
                await interaction.reply({
                    content: "❌ Le rôle Grand Maître est introuvable.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const botMember = await interaction.guild.members
                .fetchMe()
                .catch(() => null);

            if (!botMember || role.position >= botMember.roles.highest.position) {
                await interaction.reply({
                    content:
                        "❌ Le rôle du bot est trop bas pour donner le rôle Grand Maître.\n" +
                        "Monte le rôle du bot au-dessus du rôle 🏆 Grand Maître du Serveur.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const expiresAt = addDays(new Date(), 30);

            await member.roles.add(
                role,
                `Grand Maître du Serveur ${mois}/${annee}`
            );

            addTemporaryRole({
                guildId: interaction.guildId,
                userId: winner.user_id,
                roleId: role.id,
                reason: `Grand Maître du Serveur ${mois}/${annee}`,
                expiresAt: formatDateForDatabase(expiresAt),
                createdBy: interaction.user.id
            });

            const pointsChannelId = getSetting({
                guildId: interaction.guildId,
                key: "points_channel_id"
            });

            const embed = new EmbedBuilder()
                .setTitle("🏆 Grand Maître du Serveur")
                .setDescription(
                    `Le titre de **Grand Maître du Serveur** pour **${mois}/${annee}** revient à :\n\n` +
                    `# <@${winner.user_id}>`
                )
                .addFields(
                    {
                        name: "Score final",
                        value: `**${winner.total} point(s)**`,
                        inline: true
                    },
                    {
                        name: "🎁 Récompense",
                        value: `${role} pendant **30 jours**`,
                        inline: true
                    }
                )
                .setFooter({
                    text: "Le conseil du chaos a rendu son verdict."
                })
                .setTimestamp();

            if (pointsChannelId) {
                const channel = await interaction.guild.channels
                    .fetch(pointsChannelId)
                    .catch(() => null);

                if (channel && channel.isTextBased()) {
                    await channel.send({ embeds: [embed] });

                    await interaction.reply({
                        content: `✅ Grand Maître couronné dans ${channel}.`,
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
            }

            await interaction.reply({
                content: "✅ Grand Maître couronné.",
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });

            return;
        }
    }

    /* =========================
       BOUTIQUE DE POINTS
    ========================= */

    if (interaction.commandName === "boutique") {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "voir") {
            const total = getUserTotalPoints({
                guildId: interaction.guildId,
                userId: interaction.user.id,
                includeSecret: false
            });

            const embed = new EmbedBuilder()
                .setTitle("💰 Boutique BDL")
                .setDescription(
                    "Bienvenue au marché du chaos organisé.\n" +
                    `Tu possèdes actuellement **${total} point(s)** publics.\n\n` +
                    formatShopItemList()
                )
                .setColor(0xd4af37)
                .setFooter({ text: "BDL Market — les achats doivent être validés par le staff." })
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        if (subcommand === "acheter") {
            const itemKey = interaction.options.getString("item");
            const note = interaction.options.getString("note");
            const item = SHOP_ITEMS[itemKey];

            if (!item) {
                await interaction.reply({
                    content: "❌ Cet objet boutique est introuvable.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const total = getUserTotalPoints({
                guildId: interaction.guildId,
                userId: interaction.user.id,
                includeSecret: false
            });

            if (total < item.price) {
                await interaction.reply({
                    content:
                        `❌ Tu n’as pas assez de points pour acheter **${item.name}**.\n` +
                        `Prix : **${item.price}** point(s). Ton total : **${total}** point(s).`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const purchaseId = addShopPurchase({
                guildId: interaction.guildId,
                userId: interaction.user.id,
                itemKey,
                itemName: item.name,
                price: item.price,
                note
            });

            const staffChannelId =
                getSetting({ guildId: interaction.guildId, key: "shop_staff_channel_id" }) ||
                getSetting({ guildId: interaction.guildId, key: "quests_staff_channel_id" }) ||
                getSetting({ guildId: interaction.guildId, key: "rumors_staff_channel_id" });

            if (staffChannelId) {
                const staffChannel = await interaction.guild.channels
                    .fetch(staffChannelId)
                    .catch(() => null);

                if (staffChannel && staffChannel.isTextBased()) {
                    const embed = new EmbedBuilder()
                        .setTitle(`💰 Demande boutique #${purchaseId}`)
                        .setDescription("Un membre veut dépenser ses points au marché BDL.")
                        .setColor(0xd4af37)
                        .addFields(
                            { name: "👤 Membre", value: `${interaction.user}`, inline: false },
                            { name: "🛒 Achat", value: `**${item.name}**`, inline: true },
                            { name: "💰 Prix", value: `**${item.price} point(s)**`, inline: true },
                            { name: "🏦 Points actuels", value: `**${total} point(s)**`, inline: true },
                            { name: "📝 Note", value: note ? truncate(note, 500) : "Aucune précision.", inline: false },
                            { name: "⚖️ Verdict", value: "En attente de validation staff.", inline: false }
                        )
                        .setFooter({ text: "Boutique BDL — approuver retire automatiquement les points." })
                        .setTimestamp();

                    await staffChannel.send({
                        embeds: [embed],
                        components: [createShopPurchaseButtons(purchaseId)]
                    });
                }
            }

            await interaction.reply({
                content:
                    `✅ Ta demande d’achat **${item.name}** a été envoyée au staff.\n` +
                    `ID demande : **#${purchaseId}**\n` +
                    `Les points seront retirés uniquement si le staff approuve.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

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
                limit: 15
            });

            if (purchases.length === 0) {
                await interaction.reply({
                    content: `📭 Aucune demande boutique avec le statut **${status}**.`,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const lines = purchases.map(purchase => {
                return (
                    `**#${purchase.id}** — <@${purchase.user_id}>\n` +
                    `Achat : **${purchase.item_name}** — **${purchase.price} point(s)**\n` +
                    `Note : ${purchase.note ? truncate(purchase.note, 120) : "Aucune"}`
                );
            });

            await interaction.reply({
                content: `💰 **Demandes boutique — ${status}**\n\n${lines.join("\n\n")}`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        if (subcommand === "approuver") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut approuver un achat boutique.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const purchaseId = interaction.options.getInteger("id");
            const purchase = getShopPurchaseById({ guildId: interaction.guildId, purchaseId });

            if (!purchase) {
                await interaction.reply({ content: `❌ Demande #${purchaseId} introuvable.`, flags: MessageFlags.Ephemeral });
                return;
            }

            if (purchase.status !== "pending") {
                await interaction.reply({ content: `⚠️ Cette demande est déjà **${purchase.status}**.`, flags: MessageFlags.Ephemeral });
                return;
            }

            const total = getUserTotalPoints({ guildId: interaction.guildId, userId: purchase.user_id, includeSecret: false });

            if (total < purchase.price) {
                await interaction.reply({
                    content: `❌ Points insuffisants : <@${purchase.user_id}> a **${total}**, prix **${purchase.price}**.`,
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
                content: `✅ Achat #${purchaseId} approuvé. **${purchase.price} point(s)** retirés à <@${purchase.user_id}>.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        if (subcommand === "refuser") {
            if (!isStaff(interaction.member)) {
                await interaction.reply({
                    content: "❌ Seul le staff peut refuser un achat boutique.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const purchaseId = interaction.options.getInteger("id");
            const raison = interaction.options.getString("raison") ?? "Aucune raison précisée.";
            const purchase = getShopPurchaseById({ guildId: interaction.guildId, purchaseId });

            if (!purchase) {
                await interaction.reply({ content: `❌ Demande #${purchaseId} introuvable.`, flags: MessageFlags.Ephemeral });
                return;
            }

            if (purchase.status !== "pending") {
                await interaction.reply({ content: `⚠️ Cette demande est déjà **${purchase.status}**.`, flags: MessageFlags.Ephemeral });
                return;
            }

            updateShopPurchaseStatus({
                guildId: interaction.guildId,
                purchaseId,
                status: "rejected",
                reviewedBy: interaction.user.id,
                reviewReason: raison
            });

            await interaction.reply({
                content: `❌ Achat #${purchaseId} refusé. Raison : ${raison}`,
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
        const inclureSecrets =
            interaction.options.getBoolean("secrets") ?? false;

        if (inclureSecrets && !isStaff(interaction.member)) {
            await interaction.reply({
                content: "❌ Seul le staff peut consulter un profil avec les points secrets.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

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

        const rankPublic = getUserRank({
            guildId: interaction.guildId,
            userId: membre.id,
            includeSecret: false
        });

        const rankSecrets = getUserRank({
            guildId: interaction.guildId,
            userId: membre.id,
            includeSecret: true
        });

        const questCount = getUserApprovedQuestCount({
            guildId: interaction.guildId,
            userId: membre.id
        });

        const rumorCount = getUserApprovedRumorCount({
            guildId: interaction.guildId,
            userId: membre.id
        });

        const temporaryRoles = getUserActiveTemporaryRoles({
            guildId: interaction.guildId,
            userId: membre.id,
            limit: 5
        });

        const history = getUserPointsHistory({
            guildId: interaction.guildId,
            userId: membre.id,
            includeSecret: inclureSecrets,
            limit: 5
        });

        const rolesText =
            temporaryRoles.length > 0
                ? temporaryRoles
                    .map(tempRole => {
                        const expiresAt = new Date(tempRole.expires_at);
                        return `<@&${tempRole.role_id}> — expire le **${expiresAt.toLocaleString("fr-FR")}**`;
                    })
                    .join("\n")
                : "Aucun rôle temporaire actif.";

        const historyText =
            history.length > 0
                ? history
                    .map(point => {
                        const date = point.created_at;
                        const secretLabel = point.is_secret === 1 ? " 🕵️" : "";
                        const sign = point.amount > 0 ? "+" : "";
                        return `**${sign}${point.amount}**${secretLabel} — ${truncate(point.reason, 100)}\n${date}`;
                    })
                    .join("\n\n")
                : "Aucun historique de points.";

        const embed = new EmbedBuilder()
            .setTitle(`👤 Profil BDL — ${membre.username}`)
            .setThumbnail(membre.displayAvatarURL({ dynamic: true }))
            .addFields(
                {
                    name: "📊 Points publics",
                    value:
                        `Total : **${totalPublic} point(s)**\n` +
                        `Classement : **#${rankPublic ? rankPublic.rank : "—"}**`,
                    inline: true
                },
                {
                    name: inclureSecrets ? "🕵️ Points secrets inclus" : "🕵️ Points secrets",
                    value: inclureSecrets
                        ? `Total réel : **${totalAvecSecrets} point(s)**\nClassement réel : **#${rankSecrets ? rankSecrets.rank : "—"}**`
                        : "Masqués. Le staff peut utiliser `secrets:true`.",
                    inline: true
                },
                {
                    name: "🎯 Quêtes validées",
                    value: `**${questCount}** quête(s) validée(s).`,
                    inline: true
                },
                {
                    name: "💬 Rumeurs approuvées",
                    value: `**${rumorCount}** rumeur(s) proposée(s) et approuvée(s).`,
                    inline: true
                },
                {
                    name: "🎭 Rôles temporaires actifs",
                    value: truncate(rolesText, 1000),
                    inline: false
                },
                {
                    name: "📜 Historique récent",
                    value: truncate(historyText, 1000),
                    inline: false
                }
            )
            .setFooter({
                text: inclureSecrets
                    ? "Profil staff — secrets inclus"
                    : "Profil public BDL"
            })
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            flags: inclureSecrets ? MessageFlags.Ephemeral : undefined
        });

        return;
    }

    /* =========================
       BACKUP
    ========================= */

    if (interaction.commandName === "backup") {
        const subcommand = interaction.options.getSubcommand();

        if (!isStaff(interaction.member)) {
            await interaction.reply({
                content: "❌ Seul le staff peut utiliser les commandes de sauvegarde.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /backup export
        if (subcommand === "export") {
            const databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "bdl.sqlite");

            if (!fs.existsSync(databasePath)) {
                await interaction.reply({
                    content: "❌ Base de données introuvable : `data/bdl.sqlite`.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const now = new Date();
            const filename =
                `backup-bdl-${now.getFullYear()}-` +
                `${String(now.getMonth() + 1).padStart(2, "0")}-` +
                `${String(now.getDate()).padStart(2, "0")}.sqlite`;

            const attachment = new AttachmentBuilder(databasePath, {
                name: filename
            });

            await interaction.reply({
                content:
                    "💾 **Sauvegarde BDL exportée.**\n\n" +
                    "Garde ce fichier dans un endroit sûr. Il contient les points, rumeurs, quêtes, rôles temporaires et configurations du bot.",
                files: [attachment],
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /backup info
        if (subcommand === "info") {
            const databasePath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "bdl.sqlite");

            if (!fs.existsSync(databasePath)) {
                await interaction.reply({
                    content: "❌ Base de données introuvable : `data/bdl.sqlite`.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const fileStats = fs.statSync(databasePath);
            const backupStats = getBackupStats();

            const activeTempRoles = getActiveTemporaryRoleCount();
            const pendingRumors = getPendingRumorCount();
            const pendingQuestSubmissions = getPendingQuestSubmissionCount();

            const embed = new EmbedBuilder()
                .setTitle("💾 Informations de sauvegarde BDL")
                .setDescription("Résumé actuel de la base de données du bot.")
                .addFields(
                    {
                        name: "📁 Fichier",
                        value:
                            `Chemin : \`data/bdl.sqlite\`\n` +
                            `Taille : **${formatFileSize(fileStats.size)}**`,
                        inline: false
                    },
                    {
                        name: "📊 Points",
                        value: `**${backupStats.points}** entrée(s) de points`,
                        inline: true
                    },
                    {
                        name: "💬 Rumeurs",
                        value:
                            `**${backupStats.rumors}** rumeur(s)\n` +
                            `En attente : **${pendingRumors}**`,
                        inline: true
                    },
                    {
                        name: "🎯 Quêtes",
                        value:
                            `**${backupStats.quests}** quête(s)\n` +
                            `Validations : **${backupStats.questSubmissions}**\n` +
                            `En attente : **${pendingQuestSubmissions}**`,
                        inline: true
                    },
                    {
                        name: "🎭 Rôles temporaires",
                        value:
                            `Total historique : **${backupStats.temporaryRoles}**\n` +
                            `Actifs : **${activeTempRoles}**`,
                        inline: true
                    },
                    {
                        name: "🕵️ Membre Mystère",
                        value:
                            `Parties : **${backupStats.mysteryGames}**\n` +
                            `Indices : **${backupStats.mysteryHints}**\n` +
                            `Propositions : **${backupStats.mysteryGuesses}**`,
                        inline: true
                    },
                    {
                        name: "🎁 Drop Events",
                        value:
                            `Events : **${backupStats.dropEvents}**\n` +
                            `Participants : **${backupStats.dropParticipants}**`,
                        inline: true
                    },
                    {
                        name: "⚙️ Configuration",
                        value: `**${backupStats.settings}** paramètre(s) enregistré(s)`,
                        inline: true
                    }
                )
                .setFooter({
                    text: "Pense à faire /backup export régulièrement."
                })
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });

            return;
        }
    }

    /* =========================
       ARCHIVE
    ========================= */

    if (interaction.commandName === "archive") {
        const subcommand = interaction.options.getSubcommand();

        if (!isStaff(interaction.member)) {
            await interaction.reply({
                content: "❌ Seul le staff peut utiliser les commandes d’archive.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // /archive info
        if (subcommand === "info") {
            const embed = new EmbedBuilder()
                .setTitle("🗃️ Nettoyage / Archive BDL")
                .setDescription(
                    "Ces commandes servent à alléger la base de données sans toucher aux points."
                )
                .addFields(
                    {
                        name: "/archive old_drops",
                        value: "Supprime les Drop Events terminés anciens et leurs participants."
                    },
                    {
                        name: "/archive old_rumors",
                        value: "Supprime uniquement les anciennes rumeurs refusées."
                    },
                    {
                        name: "/archive old_mysteries",
                        value: "Supprime les anciennes parties Membre Mystère révélées ou fermées."
                    },
                    {
                        name: "/archive old_temp_roles",
                        value: "Supprime l’historique des rôles temporaires déjà retirés."
                    },
                    {
                        name: "/archive vacuum",
                        value: "Optimise le fichier SQLite après nettoyage."
                    },
                    {
                        name: "Sécurité",
                        value:
                            "Toutes les commandes demandent `confirmer:true`.\n" +
                            "Les points ne sont jamais supprimés."
                    }
                )
                .setFooter({
                    text: "Conseil : fais /backup export avant un gros nettoyage."
                })
                .setTimestamp();

            await interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /archive old_drops
        if (subcommand === "old_drops") {
            const confirmer = interaction.options.getBoolean("confirmer");
            const jours = interaction.options.getInteger("jours") ?? 30;

            if (!confirmer) {
                await interaction.reply({
                    content:
                        "⚠️ Nettoyage annulé.\n" +
                        "Relance avec `confirmer:true` pour supprimer les anciens Drop Events.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const result = deleteOldDropEvents({
                beforeDate: getCleanupDate(jours)
            });

            await interaction.reply({
                content:
                    `🗃️ Nettoyage Drop Events terminé.\n\n` +
                    `Critère : terminés depuis plus de **${jours} jour(s)**.\n` +
                    `Drop Events supprimés : **${result.events}**\n` +
                    `Participants supprimés : **${result.participants}**\n\n` +
                    `Tu peux faire \`/archive vacuum confirmer:true\` pour optimiser le fichier.`,
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /archive old_rumors
        if (subcommand === "old_rumors") {
            const confirmer = interaction.options.getBoolean("confirmer");
            const jours = interaction.options.getInteger("jours") ?? 30;

            if (!confirmer) {
                await interaction.reply({
                    content:
                        "⚠️ Nettoyage annulé.\n" +
                        "Relance avec `confirmer:true` pour supprimer les anciennes rumeurs refusées.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const result = deleteOldRejectedRumors({
                beforeDate: getCleanupDate(jours)
            });

            await interaction.reply({
                content:
                    `🗃️ Nettoyage rumeurs terminé.\n\n` +
                    `Critère : rumeurs refusées depuis plus de **${jours} jour(s)**.\n` +
                    `Rumeurs supprimées : **${result.rumors}**\n\n` +
                    `Les rumeurs approuvées et en attente n’ont pas été touchées.`,
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /archive old_mysteries
        if (subcommand === "old_mysteries") {
            const confirmer = interaction.options.getBoolean("confirmer");
            const jours = interaction.options.getInteger("jours") ?? 60;

            if (!confirmer) {
                await interaction.reply({
                    content:
                        "⚠️ Nettoyage annulé.\n" +
                        "Relance avec `confirmer:true` pour supprimer les anciens Membres Mystères.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const result = deleteOldMysteryGames({
                beforeDate: getCleanupDate(jours)
            });

            await interaction.reply({
                content:
                    `🗃️ Nettoyage Membre Mystère terminé.\n\n` +
                    `Critère : parties révélées/fermées depuis plus de **${jours} jour(s)**.\n` +
                    `Parties supprimées : **${result.games}**\n` +
                    `Indices supprimés : **${result.hints}**\n` +
                    `Propositions supprimées : **${result.guesses}**`,
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /archive old_temp_roles
        if (subcommand === "old_temp_roles") {
            const confirmer = interaction.options.getBoolean("confirmer");
            const jours = interaction.options.getInteger("jours") ?? 30;

            if (!confirmer) {
                await interaction.reply({
                    content:
                        "⚠️ Nettoyage annulé.\n" +
                        "Relance avec `confirmer:true` pour supprimer les anciens rôles temporaires retirés.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            const result = deleteOldRemovedTemporaryRoles({
                beforeDate: getCleanupDate(jours)
            });

            await interaction.reply({
                content:
                    `🗃️ Nettoyage rôles temporaires terminé.\n\n` +
                    `Critère : rôles retirés depuis plus de **${jours} jour(s)**.\n` +
                    `Entrées supprimées : **${result.temporaryRoles}**\n\n` +
                    `Les rôles temporaires actifs n’ont pas été touchés.`,
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        // /archive vacuum
        if (subcommand === "vacuum") {
            const confirmer = interaction.options.getBoolean("confirmer");

            if (!confirmer) {
                await interaction.reply({
                    content:
                        "⚠️ Optimisation annulée.\n" +
                        "Relance avec `confirmer:true` pour optimiser la base SQLite.",
                    flags: MessageFlags.Ephemeral
                });
                return;
            }

            vacuumDatabase();

            await interaction.reply({
                content:
                    "✅ Base SQLite optimisée avec `VACUUM`.\n" +
                    "La taille du fichier peut avoir diminué si beaucoup de données ont été supprimées.",
                flags: MessageFlags.Ephemeral
            });

            return;
        }
    }
}

/* =========================
   READY
========================= */

// Événement déclenché quand le bot est connecté.
client.once(Events.ClientReady, readyClient => {
    console.log(`✅ Connecté en tant que ${readyClient.user.tag}`);

    // Nettoie immédiatement les rôles temporaires expirés au démarrage.
    cleanupExpiredTemporaryRoles(client);

    // Nettoie les rôles temporaires toutes les 10 minutes.
    cron.schedule("*/10 * * * *", () => {
        cleanupExpiredTemporaryRoles(client);
    });

    const guildId = process.env.GUILD_ID;

    // Vérifie chaque minute si DISBOARD a autorisé un nouveau bump.
    cron.schedule("* * * * *", () => {
        checkScheduledBumpReminder(client, guildId);
    }, {
        timezone: "Europe/Paris"
    });

    console.log("⏰ Rappel bump intelligent activé.");

    // Mardi 20h : indice 1 du Membre Mystère.
    cron.schedule("0 20 * * 2", () => {
        publishMysteryHint(client, guildId, 1);
    }, {
        timezone: "Europe/Paris"
    });

    // Jeudi 20h : indice 2 du Membre Mystère.
    cron.schedule("0 20 * * 4", () => {
        publishMysteryHint(client, guildId, 2);
    }, {
        timezone: "Europe/Paris"
    });

    // Samedi 20h : indice 3 du Membre Mystère.
    cron.schedule("0 20 * * 6", () => {
        publishMysteryHint(client, guildId, 3);
    }, {
        timezone: "Europe/Paris"
    });

    // Dimanche 20h45 : rappel avant la révélation.
    cron.schedule("45 20 * * 0", () => {
        sendMysteryRevealReminder(client, guildId);
    }, {
        timezone: "Europe/Paris"
    });

    console.log("🕵️ Planning automatique du Membre Mystère activé.");
});

/* =========================
   INTERACTIONS
========================= */

// Événement déclenché à chaque interaction Discord :
// slash command, bouton, menu, etc.
client.on(Events.MessageCreate, async message => {
    try {
        await handleDisboardBumpMessage(message);
    } catch (error) {
        console.error("Erreur pendant la détection du bump :", error);
    }
});

client.on(Events.InteractionCreate, async interaction => {
    try {
        // Si c’est un bouton, on l’envoie au routeur des boutons.
        if (interaction.isButton()) {
            await handleButtonInteraction(interaction);
            return;
        }

        // Si c’est une commande slash, on l’envoie au routeur des commandes.
        if (interaction.isChatInputCommand()) {
            await handleCommandInteraction(interaction);
            return;
        }
    } catch (error) {
        // Sécurité : si une commande plante, on log l’erreur dans le terminal.
        console.error("Erreur pendant une interaction :", error);

        // Et on répond proprement sur Discord.
        await replyError(
            interaction,
            "Une erreur est survenue pendant l’exécution de cette action."
        );
    }
});

/* =========================
   ERREURS GLOBALES
========================= */

// Attrape les promesses non gérées.
// Ça évite que certaines erreurs silencieuses soient invisibles.
process.on("unhandledRejection", error => {
    console.error("Unhandled promise rejection :", error);
});

// Attrape les exceptions non prévues.
// Le bot affiche l’erreur au lieu de rester silencieux.
process.on("uncaughtException", error => {
    console.error("Uncaught exception :", error);
});

/* =========================
   CONNEXION
========================= */

// Connecte le bot à Discord avec le token du fichier .env.
client.login(process.env.DISCORD_TOKEN);