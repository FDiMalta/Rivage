const {
  EmbedBuilder,
  MessageFlags,
  AttachmentBuilder,
  PermissionFlagsBits
} = require("discord.js");
const {
  isStaff,
  canBotManageRole,
  sanitizeInput,
  clearStaffCache
} = require("../utils/permissions");
const {
  replyError,
  validateInteraction,
  safeExecute,
  logError
} = require("../utils/errors");
const {
  getCachedUserPoints,
  getCachedLeaderboard,
  getCachedSetting,
  clearUserCache,
  clearGuildCache,
  clearSettingCache
} = require("../utils/cache");
const {
  truncate,
  formatMultilineInput,
  applyAttachmentImage,
  addDays,
  subtractDays,
  formatDateForDatabase,
  getCleanupDate,
  formatFileSize,
  getWeekKey,
  SHOP_ITEMS,
  formatShopItemList,
  createPaginationButtons,
  paginateList
} = require("../utils/formatters");
const db = require("../../database");
const logger = require("../utils/logger");

// =============================================================================
// FONCTION PRINCIPALE POUR GÉRER LES COMMANDES
// =============================================================================
async function handleCommandInteraction(interaction, client) {
  try {
    validateInteraction(interaction);
    const { commandName, options, guildId, user, guild, member } = interaction;

    // =========================
    // PING
    // =========================
    if (commandName === "ping") {
      await interaction.reply("Pong 🏓 Le bot BDL fonctionne !");
      return;
    }

    // =========================
    // POINTS
    // =========================
    if (commandName === "points") {
      const subcommand = options.getSubcommand();

      // /points ajouter
      if (subcommand === "ajouter") {
        if (!isStaff(member)) {
          await replyError(interaction, "Tu n’as pas la permission d’ajouter des points.");
          return;
        }

        const membre = options.getUser("membre");
        const nombre = options.getInteger("nombre");
        const raison = sanitizeInput(options.getString("raison"));
        const secret = options.getBoolean("secret") ?? false;

        // Vérifier que le membre existe sur le serveur
        const targetMember = await guild.members.fetch(membre.id).catch(() => null);
        if (!targetMember) {
          await replyError(interaction, "Membre introuvable sur ce serveur.");
          return;
        }

        db.addPoints({
          guildId,
          userId: membre.id,
          amount: nombre,
          reason: raison,
          isSecret: secret,
          createdBy: user.id
        });

        // Invalider le cache
        clearUserCache(guildId, membre.id);

        const totalPublic = getCachedUserPoints({ guildId, userId: membre.id, includeSecret: false });

        if (secret) {
          await interaction.reply({
            content: `🕵️ **${nombre} point(s) secret(s)** ajoutés à ${membre}.\nRaison : ${raison}`,
            flags: MessageFlags.Ephemeral
          });
        } else {
          await interaction.reply(
            `🏆 ${membre} gagne **+${nombre} point(s)** !\nRaison : ${raison}\nTotal public : **${totalPublic} point(s)**.`
          );
        }
        return;
      }

      // /points retirer
      if (subcommand === "retirer") {
        if (!isStaff(member)) {
          await replyError(interaction, "Tu n’as pas la permission de retirer des points.");
          return;
        }

        const membre = options.getUser("membre");
        const nombre = options.getInteger("nombre");
        const raison = sanitizeInput(options.getString("raison"));
        const secret = options.getBoolean("secret") ?? false;

        const targetMember = await guild.members.fetch(membre.id).catch(() => null);
        if (!targetMember) {
          await replyError(interaction, "Membre introuvable sur ce serveur.");
          return;
        }

        db.addPoints({
          guildId,
          userId: membre.id,
          amount: -nombre,
          reason: `Retrait : ${raison}`,
          isSecret: secret,
          createdBy: user.id
        });

        // Invalider le cache
        clearUserCache(guildId, membre.id);

        const totalPublic = getCachedUserPoints({ guildId, userId: membre.id, includeSecret: false });
        const totalAvecSecrets = getCachedUserPoints({ guildId, userId: membre.id, includeSecret: true });

        if (secret) {
          await interaction.reply({
            content: `🕵️ **-${nombre} point(s) secret(s)** retirés à ${membre}.\nRaison : ${raison}\nTotal avec secrets : **${totalAvecSecrets} point(s)**.`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        await interaction.reply(
          `📉 ${membre} perd **-${nombre} point(s)**.\nRaison : ${raison}\nTotal public : **${totalPublic} point(s)**.`
        );
        return;
      }

      // /points voir
      if (subcommand === "voir") {
        const membre = options.getUser("membre") ?? user;
        const inclureSecrets = options.getBoolean("inclure_secrets") ?? false;

        if (inclureSecrets && !isStaff(member)) {
          await replyError(interaction, "Seul le staff peut voir les points secrets.");
          return;
        }

        const total = getCachedUserPoints({ guildId, userId: membre.id, includeSecret: inclureSecrets });
        await interaction.reply({
          content: `📊 ${membre} a **${total} point(s)**${inclureSecrets ? " au total, secrets inclus." : " publics."}`,
          flags: inclureSecrets ? MessageFlags.Ephemeral : undefined
        });
        return;
      }

      // /points classement
      if (subcommand === "classement") {
        const inclureSecrets = options.getBoolean("inclure_secrets") ?? false;

        if (inclureSecrets && !isStaff(member)) {
          await replyError(interaction, "Seul le staff peut voir le classement avec les points secrets.");
          return;
        }

        const allLeaderboard = getCachedLeaderboard({ guildId, includeSecret: inclureSecrets, limit: 1000 });
        const { items: leaderboard, currentPage, totalPages } = paginateList(allLeaderboard, 0, 10);

        const lines = leaderboard.map((row, index) => {
          return `**${index + 1}.** <@${row.user_id}> — **${row.total} point(s)**`;
        });

        const embed = new EmbedBuilder()
          .setTitle(`🏆 Classement BDL${inclureSecrets ? " — secrets inclus" : ""}`)
          .setDescription(lines.join("\n"));

        await interaction.reply({
          embeds: [embed],
          components: totalPages > 1 ? [createPaginationButtons(0, totalPages, "points_classement")] : [],
          flags: inclureSecrets ? MessageFlags.Ephemeral : undefined
        });
        return;
      }

      // /points historique
      if (subcommand === "historique") {
        const membre = options.getUser("membre") ?? user;
        const inclureSecrets = options.getBoolean("secrets") ?? false;

        if (inclureSecrets && !isStaff(member)) {
          await replyError(interaction, "Seul le staff peut voir l’historique avec les points secrets.");
          return;
        }

        const history = db.getUserPointsHistory({
          guildId,
          userId: membre.id,
          includeSecret: inclureSecrets,
          limit: 15
        });

        const total = getCachedUserPoints({ guildId, userId: membre.id, includeSecret: inclureSecrets });

        if (history.length === 0) {
          await interaction.reply({
            content: `📭 Aucun point trouvé pour ${membre}${inclureSecrets ? " avec les secrets inclus." : "."}`,
            flags: inclureSecrets ? MessageFlags.Ephemeral : undefined
          });
          return;
        }

        const lines = history.map(point => {
          const date = point.created_at;
          const secretLabel = point.is_secret === 1 ? " 🕵️ secret" : "";
          return `**${point.amount > 0 ? "+" : ""}${point.amount}**${secretLabel} — ${date}\n> ${truncate(point.reason, 180)}`;
        });

        const embed = new EmbedBuilder()
          .setTitle(`📜 Historique des points — ${membre.username}`)
          .setDescription(`Total : **${total} point(s)**${inclureSecrets ? " secrets inclus" : " publics"}`)
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

    // =========================
    // RUMEURS
    // =========================
    if (commandName === "rumeur") {
      const subcommand = options.getSubcommand();

      // /rumeur proposer
      if (subcommand === "proposer") {
        const texte = sanitizeInput(formatMultilineInput(options.getString("texte")));
        const cible = options.getUser("cible");
        const anonyme = options.getBoolean("anonyme") ?? false;

        const rumorId = db.addRumor({
          guildId,
          authorId: user.id,
          content: texte,
          targetUserId: cible ? cible.id : null,
          anonymous: anonyme
        });

        const staffChannelId = getCachedSetting({ guildId, key: "rumors_staff_channel_id" });
        if (staffChannelId) {
          const staffChannel = await guild.channels.fetch(staffChannelId).catch(() => null);
          if (staffChannel && staffChannel.isTextBased()) {
            const embed = new EmbedBuilder()
              .setTitle("💬 Nouvelle rumeur proposée")
              .setDescription(truncate(texte, 1000))
              .addFields(
                { name: "ID", value: `#${rumorId}`, inline: true },
                {
                  name: "Auteur",
                  value: anonyme ? `${user} — souhaite être anonyme dans la Gazette` : `${user}`,
                  inline: false
                },
                { name: "Cible", value: cible ? `${cible}` : "Aucune cible indiquée", inline: false },
                { name: "Statut", value: "En attente de validation", inline: true }
              )
              .setFooter({
                text: "Clique sur un bouton ou utilise /rumeur approuver / refuser."
              })
              .setTimestamp();

            const { createActionButtons } = require("../handlers/buttons");
            await staffChannel.send({
              embeds: [embed],
              components: [createActionButtons("rumor", rumorId)]
            }).catch(error => {
              logger.error("Échec de l'envoi de la rumeur au salon staff", { error: error.message });
            });
          }
        }

        await interaction.reply({
          content: `✅ Ta rumeur a été envoyée au staff pour validation !\nID : **#${rumorId}**`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // /rumeur liste
      if (subcommand === "liste") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut lister les rumeurs.");
          return;
        }

        const status = options.getString("statut") ?? "pending";
        const rumors = db.getRumorsByStatus({ guildId, status, limit: 10 });

        if (rumors.length === 0) {
          await interaction.reply(`Aucune rumeur **${status}** trouvée.`);
          return;
        }

        const lines = rumors.map(rumor => {
          const author = rumor.anonymous ? "Anonyme" : `<@${rumor.author_id}>`;
          return `**#${rumor.id}** — ${author}\n> ${truncate(rumor.content, 200)}\nStatut : **${rumor.status}**`;
        });

        await interaction.reply({
          content: `📜 **Rumeurs ${status}** (10 dernières)\n\n${lines.join("\n\n")}`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // /rumeur approuver
      if (subcommand === "approuver") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut approuver les rumeurs.");
          return;
        }

        const rumorId = options.getInteger("id");
        const rumor = db.getRumorById({ guildId, rumorId });

        if (!rumor) {
          await replyError(interaction, `Aucune rumeur trouvée avec l’ID #${rumorId}.`);
          return;
        }

        db.updateRumorStatus({
          guildId,
          rumorId,
          status: "approved",
          reviewedBy: user.id
        });

        // Invalider le cache des rumeurs
        clearGuildCache(guildId);

        await interaction.reply({
          content: `✅ La rumeur **#${rumorId}** a été **approuvée**.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // /rumeur refuser
      if (subcommand === "refuser") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut refuser les rumeurs.");
          return;
        }

        const rumorId = options.getInteger("id");
        const reason = options.getString("raison") ? sanitizeInput(options.getString("raison")) : null;

        const rumor = db.getRumorById({ guildId, rumorId });
        if (!rumor) {
          await replyError(interaction, `Aucune rumeur trouvée avec l’ID #${rumorId}.`);
          return;
        }

        db.updateRumorStatus({
          guildId,
          rumorId,
          status: "rejected",
          reviewedBy: user.id,
          reviewReason: reason
        });

        // Invalider le cache des rumeurs
        clearGuildCache(guildId);

        await interaction.reply({
          content: `✅ La rumeur **#${rumorId}** a été **refusée**${reason ? ` : ${reason}` : ""}.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }
    }

    // =========================
    // GAZETTE
    // =========================
    if (commandName === "gazette") {
      const subcommand = options.getSubcommand();

      // /gazette brouillon
      if (subcommand === "brouillon") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut générer un brouillon de Gazette.");
          return;
        }

        await interaction.deferReply({ ephemeral: true });

        const leaderboard = getCachedLeaderboard({ guildId, includeSecret: false, limit: 3 });
        const approvedRumors = db.getRumorsByStatus({ guildId, status: "approved", limit: 5 });
        const topQuests = db.getUserApprovedQuestCount({ guildId, userId: null });

        const embed = new EmbedBuilder()
          .setTitle("📰 Gazette BDL — Brouillon")
          .setDescription("Voici un brouillon automatique pour la Gazette de cette semaine.")
          .addFields(
            {
              name: "🏆 Classement des Points",
              value: leaderboard.length > 0
                ? leaderboard.map((row, i) => `**${i + 1}.** <@${row.user_id}> — ${row.total} pts`).join("\n")
                : "Aucun point attribué.",
              inline: false
            },
            {
              name: "💬 Rumeurs de la Semaine",
              value: approvedRumors.length > 0
                ? approvedRumors.map(rumor => `> ${truncate(rumor.content, 200)}`).join("\n\n")
                : "Aucune rumeur approuvée.",
              inline: false
            }
          )
          .setFooter({ text: "Utilise /gazette publier pour personnaliser et publier." })
          .setTimestamp();

        await interaction.followUp({ embeds: [embed], ephemeral: true });
        return;
      }

      // /gazette publier
      if (subcommand === "publier") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut publier la Gazette.");
          return;
        }

        const titre = sanitizeInput(options.getString("titre"));
        const pepites = sanitizeInput(formatMultilineInput(options.getString("pepites")));
        const stats = sanitizeInput(formatMultilineInput(options.getString("stats")));
        const rumeur = sanitizeInput(formatMultilineInput(options.getString("rumeur")));
        const exploit = sanitizeInput(formatMultilineInput(options.getString("exploit")));
        const nominations = options.getString("nominations") ? sanitizeInput(formatMultilineInput(options.getString("nominations"))) : null;
        const banniere = options.getAttachment("banniere");

        const gazetteChannelId = getCachedSetting({ guildId, key: "gazette_channel_id" });
        if (!gazetteChannelId) {
          await replyError(interaction, "Aucun salon Gazette configuré. Utilise /config salon Gazette.");
          return;
        }

        const channel = await guild.channels.fetch(gazetteChannelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
          await replyError(interaction, "Salon Gazette introuvable.");
          return;
        }

        await interaction.deferReply({ ephemeral: true });

        const embed = new EmbedBuilder()
          .setTitle(`📰 ${titre}`)
          .setDescription("**La Gazette Royale BDL**")
          .addFields(
            { name: "💎 Pépites de la Semaine", value: pepites, inline: false },
            { name: "📊 Statistiques Absurdes", value: stats, inline: false },
            { name: "🗣️ Rumeur de la Semaine", value: rumeur, inline: false },
            { name: "🏅 Exploit de la Semaine", value: exploit, inline: false }
          );

        if (nominations) {
          embed.addFields({ name: "👑 Nominations", value: nominations, inline: false });
        }

        if (banniere) {
          embed.setImage(banniere.url);
        }

        embed.setColor(0x9b59b6).setTimestamp();

        await channel.send({ embeds: [embed] });
        await interaction.followUp({ content: "✅ Gazette publiée avec succès !", ephemeral: true });
        return;
      }
    }

    // =========================
    // CONFIG
    // =========================
    if (commandName === "config") {
      const subcommand = options.getSubcommand();

      // /config salon
      if (subcommand === "salon") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut configurer les salons.");
          return;
        }

        const type = options.getString("type");
        const channel = options.getChannel("salon");

        db.setSetting({ guildId, key: type, value: channel.id });

        // Invalider le cache du paramètre
        clearSettingCache(guildId, type);

        await interaction.reply({
          content: `✅ Salon **${type}** configuré : ${channel}`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // /config role_staff
      if (subcommand === "role_staff") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut configurer le rôle staff.");
          return;
        }

        const role = options.getRole("role");
        db.setSetting({ guildId, key: "staff_role_id", value: role.id });

        // Invalider le cache du rôle staff
        clearStaffCache(guildId);
        clearSettingCache(guildId, "staff_role_id");

        await interaction.reply({
          content: `✅ Rôle staff configuré : ${role}`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // /config role_bump
      if (subcommand === "role_bump") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut configurer le rôle bump.");
          return;
        }

        const role = options.getRole("role");
        db.setSetting({ guildId, key: "bump_role_id", value: role.id });
        clearSettingCache(guildId, "bump_role_id");

        await interaction.reply({
          content: `✅ Rôle bump configuré : ${role}`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // /config voir
      if (subcommand === "voir") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut voir la configuration.");
          return;
        }

        const settings = db.getAllSettings({ guildId });
        if (settings.length === 0) {
          await interaction.reply("Aucune configuration enregistrée.");
          return;
        }

        const lines = settings.map(setting => {
          return `**${setting.key}** : ${setting.value}`;
        });

        await interaction.reply({
          content: `⚙️ **Configuration actuelle**\n\n${lines.join("\n")}`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }
    }

    // =========================
    // QUÊTES
    // =========================
    if (commandName === "quete") {
      const subcommand = options.getSubcommand();

      // /quete publier
      if (subcommand === "publier") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut publier une quête.");
          return;
        }

        const titre = sanitizeInput(options.getString("titre"));
        const description = sanitizeInput(formatMultilineInput(options.getString("description")));
        const points = options.getInteger("points") ?? 1;
        const role = options.getRole("role");
        const joursRole = options.getInteger("jours_role") ?? 7;
        const image = options.getAttachment("image");

        const questId = db.addQuest({
          guildId,
          title: titre,
          description,
          rewardPoints: points,
          rewardRoleId: role?.id,
          rewardRoleDays: joursRole,
          createdBy: user.id
        });

        const questsChannelId = getCachedSetting({ guildId, key: "quests_channel_id" });
        if (questsChannelId) {
          const channel = await guild.channels.fetch(questsChannelId).catch(() => null);
          if (channel && channel.isTextBased()) {
            const embed = new EmbedBuilder()
              .setTitle(`📜 Quête : ${titre}`)
              .setDescription(description)
              .addFields(
                {
                  name: "Récompense",
                  value: `**${points} point(s)**${role ? ` + rôle **${role.name}** (${joursRole} jours)` : ""}`,
                  inline: false
                },
                { name: "ID", value: `#${questId}`, inline: true }
              )
              .setFooter({ text: "Utilise /quete valider pour soumettre ta preuve." })
              .setTimestamp();

            if (image) {
              embed.setImage(image.url);
            }

            await channel.send({ embeds: [embed] }).catch(error => {
              logger.error("Échec de l'envoi de la quête", { error: error.message });
            });
          }
        }

        await interaction.reply({
          content: `✅ Quête **${titre}** publiée !\nID : **#${questId}**`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // /quete liste
      if (subcommand === "liste") {
        const quests = db.getActiveQuests({ guildId, limit: 10 });

        if (quests.length === 0) {
          await interaction.reply("Aucune quête active.");
          return;
        }

        const lines = quests.map(quest => {
          return `**#${quest.id} — ${quest.title}**\n> ${truncate(quest.description, 200)}\nRécompense : **${quest.reward_points} point(s)**`;
        });

        await interaction.reply({
          content: `📜 **Quêtes actives** (10 premières)\n\n${lines.join("\n\n")}`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // /quete valider
      if (subcommand === "valider") {
        const questId = options.getInteger("id");
        const preuve = sanitizeInput(formatMultilineInput(options.getString("preuve")));
        const photo = options.getAttachment("photo");
        const membreMentionne = options.getUser("membre_mentionne");
        const lien = options.getString("lien") ? sanitizeInput(options.getString("lien")) : null;

        const quest = db.getQuestById({ guildId, questId });
        if (!quest) {
          await replyError(interaction, `Aucune quête trouvée avec l’ID #${questId}.`);
          return;
        }

        if (quest.status !== "active") {
          await replyError(interaction, `Cette quête est **${quest.status}** et ne peut plus être validée.`);
          return;
        }

        // Vérifier que l'utilisateur n'a pas déjà soumis cette quête
        const existingSubmissions = db.getQuestSubmissionsByStatus({
          guildId,
          status: "pending",
          limit: 50
        }).filter(sub => sub.user_id === user.id && sub.quest_id === questId);

        if (existingSubmissions.length > 0) {
          await replyError(interaction, "Tu as déjà soumis une validation pour cette quête en attente de traitement.");
          return;
        }

        const submissionId = db.addQuestSubmission({
          guildId,
          questId,
          userId: user.id,
          proof: preuve,
          proofImageUrl: photo?.url,
          mentionedUserId: membreMentionne?.id,
          proofLink: lien
        });

        const staffChannelId = getCachedSetting({ guildId, key: "quests_staff_channel_id" });
        if (staffChannelId) {
          const staffChannel = await guild.channels.fetch(staffChannelId).catch(() => null);
          if (staffChannel && staffChannel.isTextBased()) {
            const embed = new EmbedBuilder()
              .setTitle(`📜 Validation de quête : ${quest.title}`)
              .setDescription(truncate(preuve, 500))
              .addFields(
                { name: "ID", value: `#${submissionId}`, inline: true },
                { name: "Quête", value: `#${questId} — ${quest.title}`, inline: true },
                { name: "Membre", value: `${user}`, inline: false },
                {
                  name: "Preuve supplémentaire",
                  value: photo ? `[Image](${photo.url})` + (lien ? `\n[Lien](${lien})` : "") : (lien ? `[Lien](${lien})` : "Aucune"),
                  inline: false
                },
                { name: "Membre mentionné", value: membreMentionne ? `${membreMentionne}` : "Aucun", inline: false },
                { name: "Statut", value: "En attente de validation", inline: true }
              )
              .setFooter({ text: "Clique sur un bouton pour valider ou refuser." })
              .setTimestamp();

            const { createActionButtons } = require("../handlers/buttons");
            await staffChannel.send({
              embeds: [embed],
              components: [createActionButtons("quest", submissionId, { approve: "Approuver", reject: "Refuser" })]
            }).catch(error => {
              logger.error("Échec de l'envoi de la validation de quête", { error: error.message });
            });
          }
        }

        await interaction.reply({
          content: `✅ Ta validation pour la quête **${quest.title}** a été envoyée au staff !\nID : **#${submissionId}**`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // /quete submissions
      if (subcommand === "submissions") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut lister les validations.");
          return;
        }

        const status = options.getString("statut") ?? "pending";
        const submissions = db.getQuestSubmissionsByStatus({ guildId, status, limit: 10 });

        if (submissions.length === 0) {
          await interaction.reply(`Aucune validation **${status}** trouvée.`);
          return;
        }

        const lines = submissions.map(sub => {
          return `**#${sub.id}** — Quête **#${sub.quest_id}** par <@${sub.user_id}>\n> ${truncate(sub.proof, 100)}\nStatut : **${sub.status}**`;
        });

        await interaction.reply({
          content: `📜 **Validations ${status}** (10 dernières)\n\n${lines.join("\n\n")}`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // /quete approuver
      if (subcommand === "approuver") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut approuver les validations.");
          return;
        }

        const submissionId = options.getInteger("id");
        const submission = db.getQuestSubmissionById({ guildId, submissionId });

        if (!submission) {
          await replyError(interaction, `Aucune validation trouvée avec l’ID #${submissionId}.`);
          return;
        }

        db.updateQuestSubmissionStatus({
          guildId,
          submissionId,
          status: "approved",
          reviewedBy: user.id
        });

        // Invalider le cache de l'utilisateur
        clearUserCache(guildId, submission.user_id);

        await interaction.reply({
          content: `✅ La validation **#${submissionId}** a été **approuvée**.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // /quete refuser
      if (subcommand === "refuser") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut refuser les validations.");
          return;
        }

        const submissionId = options.getInteger("id");
        const reason = options.getString("raison") ? sanitizeInput(options.getString("raison")) : null;

        const submission = db.getQuestSubmissionById({ guildId, submissionId });
        if (!submission) {
          await replyError(interaction, `Aucune validation trouvée avec l’ID #${submissionId}.`);
          return;
        }

        db.updateQuestSubmissionStatus({
          guildId,
          submissionId,
          status: "rejected",
          reviewedBy: user.id,
          reviewReason: reason
        });

        await interaction.reply({
          content: `✅ La validation **#${submissionId}** a été **refusée**${reason ? ` : ${reason}` : ""}.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // /quete fermer
      if (subcommand === "fermer") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut fermer une quête.");
          return;
        }

        const questId = options.getInteger("id");
        const quest = db.getQuestById({ guildId, questId });

        if (!quest) {
          await replyError(interaction, `Aucune quête trouvée avec l’ID #${questId}.`);
          return;
        }

        db.closeQuest({ guildId, questId });
        clearGuildCache(guildId);

        await interaction.reply({
          content: `✅ La quête **#${questId} — ${quest.title}** a été fermée.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }
    }

    // =========================
    // RÔLES TEMPORAIRES
    // =========================
    if (commandName === "role") {
      const subcommand = options.getSubcommand();

      // /role temporaire
      if (subcommand === "temporaire") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut donner des rôles temporaires.");
          return;
        }

        const membre = options.getUser("membre");
        const role = options.getRole("role");
        const jours = options.getInteger("jours");
        const raison = options.getString("raison") ? sanitizeInput(options.getString("raison")) : "Rôle temporaire donné par le staff";

        const targetMember = await guild.members.fetch(membre.id).catch(() => null);
        if (!targetMember) {
          await replyError(interaction, "Membre introuvable.");
          return;
        }

        // Vérifier que le bot peut gérer ce rôle
        const canManage = await canBotManageRole(guild, role);
        if (!canManage) {
          await replyError(interaction, "Le bot n'a pas les permissions pour gérer ce rôle (son rôle est trop bas ou le rôle est géré par une intégration).");
          return;
        }

        await targetMember.roles.add(role.id, raison).catch(async () => {
          await replyError(interaction, "Impossible d'ajouter ce rôle.");
        });

        const expiresAt = addDays(new Date(), jours);
        db.addTemporaryRole({
          guildId,
          userId: membre.id,
          roleId: role.id,
          reason: raison,
          expiresAt: formatDateForDatabase(expiresAt),
          createdBy: user.id
        });

        // Invalider le cache des rôles temporaires
        clearUserCache(guildId, membre.id);

        await interaction.reply({
          content: `✅ Rôle **${role.name}** donné à ${membre} pour **${jours} jours**.\nExpire le : **${expiresAt.toLocaleDateString("fr-FR")}**`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // /role liste
      if (subcommand === "liste") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut lister les rôles temporaires.");
          return;
        }

        const tempRoles = db.getActiveTemporaryRoles({ guildId, limit: 20 });
        if (tempRoles.length === 0) {
          await interaction.reply("Aucun rôle temporaire actif.");
          return;
        }

        const lines = tempRoles.map(tempRole => {
          const expiresAt = new Date(tempRole.expires_at);
          return `**<@${tempRole.user_id}>** — **<@&${tempRole.role_id}>**\n> Expire le : **${expiresAt.toLocaleDateString("fr-FR")}**\nRaison : ${tempRole.reason}`;
        });

        await interaction.reply({
          content: `📜 **Rôles temporaires actifs** (20 premiers)\n\n${lines.join("\n\n")}`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }
    }

    // =========================
    // MEMBRE MYSTÈRE
    // =========================
    if (commandName === "mystere") {
      const subcommand = options.getSubcommand();

      // /mystere set
      if (subcommand === "set") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut définir le Membre Mystère.");
          return;
        }

        const membre = options.getUser("membre");
        const semaine = options.getString("semaine") ?? getWeekKey();
        const image = options.getAttachment("image");

        // Fermer l'ancienne partie si elle existe
        const oldGame = db.getActiveMysteryGame({ guildId });
        if (oldGame) {
          db.revealMysteryGame({ guildId, gameId: oldGame.id, winnerUserId: null });
        }

        const gameId = db.createMysteryGame({
          guildId,
          targetUserId: membre.id,
          weekKey: semaine,
          createdBy: user.id
        });

        await interaction.reply({
          content: `✅ Membre Mystère défini : **${membre}** pour la semaine **${semaine}** !\nID : **#${gameId}**`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // /mystere indice
      if (subcommand === "indice") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut ajouter un indice.");
          return;
        }

        const numero = options.getInteger("numero");
        const texte = sanitizeInput(formatMultilineInput(options.getString("texte")));
        const publier = options.getBoolean("publier") ?? false;

        const game = db.getActiveMysteryGame({ guildId });
        if (!game) {
          await replyError(interaction, "Aucun Membre Mystère actif. Utilise /mystere set d'abord.");
          return;
        }

        db.addMysteryHint({
          guildId,
          gameId: game.id,
          hintNumber: numero,
          content: texte
        });

        if (publier) {
          const mysteryChannelId = getCachedSetting({ guildId, key: "mystery_channel_id" });
          if (mysteryChannelId) {
            const channel = await guild.channels.fetch(mysteryChannelId).catch(() => null);
            if (channel && channel.isTextBased()) {
              const embed = new EmbedBuilder()
                .setTitle(`🕵️ Membre Mystère — Indice #${numero}`)
                .setDescription(texte)
                .setFooter({ text: "Faites vos propositions avec /mystere guess" })
                .setTimestamp();

              await channel.send({ embeds: [embed] }).catch(error => {
                logger.error("Échec de la publication de l'indice", { error: error.message });
              });

              db.markMysteryHintPublished({ guildId, gameId: game.id, hintNumber: numero });
            }
          }
        }

        await interaction.reply({
          content: `✅ Indice **#${numero}**${publier ? " publié" : " enregistré"} pour le Membre Mystère.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // /mystere guess
      if (subcommand === "guess") {
        const membre = options.getUser("membre");

        const game = db.getActiveMysteryGame({ guildId });
        if (!game) {
          await replyError(interaction, "Aucun Membre Mystère actif.");
          return;
        }

        if (db.hasMysteryGuessToday({ guildId, gameId: game.id, userId: user.id })) {
          await replyError(interaction, "Tu as déjà fait une proposition aujourd’hui ! Attends demain.");
          return;
        }

        const isCorrect = membre.id === game.target_user_id;
        db.addMysteryGuess({
          guildId,
          gameId: game.id,
          userId: user.id,
          guessedUserId: membre.id,
          isCorrect
        });

        if (isCorrect) {
          await interaction.reply({
            content: `🎉 **Félicitations !** Tu as trouvé le Membre Mystère : **${membre}** !\nLe staff va bientôt révéler officiellement.`,
            flags: MessageFlags.Ephemeral
          });

          // Donner des points au gagnant
          db.addPoints({
            guildId,
            userId: user.id,
            amount: 10,
            reason: "Membre Mystère trouvé",
            isSecret: false,
            createdBy: client.user.id
          });
          clearUserCache(guildId, user.id);
        } else {
          await interaction.reply({
            content: `🔍 Ta proposition (**${membre}**) a été enregistrée. Bonne chance !`,
            flags: MessageFlags.Ephemeral
          });
        }
        return;
      }

      // /mystere reveal
      if (subcommand === "reveal") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut révéler le Membre Mystère.");
          return;
        }

        const game = db.getActiveMysteryGame({ guildId });
        if (!game) {
          await replyError(interaction, "Aucun Membre Mystère actif.");
          return;
        }

        const mysteryChannelId = getCachedSetting({ guildId, key: "mystery_channel_id" });
        if (!mysteryChannelId) {
          await replyError(interaction, "Aucun salon Membre Mystère configuré.");
          return;
        }

        const channel = await guild.channels.fetch(mysteryChannelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
          await replyError(interaction, "Salon Membre Mystère introuvable.");
          return;
        }

        const firstGuess = db.getFirstCorrectMysteryGuess({ guildId, gameId: game.id });
        const winner = firstGuess ? await client.users.fetch(firstGuess.user_id).catch(() => null) : null;

        db.revealMysteryGame({
          guildId,
          gameId: game.id,
          winnerUserId: winner?.id
        });

        const targetUser = await client.users.fetch(game.target_user_id).catch(() => null);
        const embed = new EmbedBuilder()
          .setTitle("🎉 **RÉVÉLATION DU MEMBRE MYSTÈRE**")
          .setDescription(
            `Le Membre Mystère de cette semaine était... **${targetUser}** !\n\n` +
            (winner ? `🏆 **${winner}** a été le premier à trouver la bonne réponse !` : "Personne n'a trouvé la bonne réponse cette fois.")
          )
          .setTimestamp();

        await channel.send({ embeds: [embed] });
        await interaction.reply({
          content: `✅ Membre Mystère révélé : **${targetUser}** !`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // /mystere statut
      if (subcommand === "statut") {
        const game = db.getActiveMysteryGame({ guildId });
        if (!game) {
          await interaction.reply("📭 Aucun Membre Mystère actif actuellement.");
          return;
        }

        const targetUser = await client.users.fetch(game.target_user_id).catch(() => null);
        const hints = db.getMysteryHints({ guildId, gameId: game.id });
        const guesses = db.getTopCorrectMysteryGuessers({ guildId, gameId: game.id, limit: 3 });

        const embed = new EmbedBuilder()
          .setTitle("🕵️ **Statut du Membre Mystère**")
          .addFields(
            { name: "Semaine", value: game.week_key, inline: true },
            { name: "Statut", value: game.status, inline: true },
            { name: "Membre Mystère", value: targetUser ? targetUser.toString() : "Inconnu", inline: false },
            {
              name: "Indices publiés",
              value: hints.filter(h => h.published === 1).length + "/" + hints.length,
              inline: true
            },
            {
              name: "Bonne(s) réponse(s)",
              value: guesses.length > 0 ? guesses.map(g => `<@${g.user_id}>`).join(", ") : "Aucune",
              inline: true
            }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
    }

    // =========================
    // DROP EVENTS
    // =========================
    if (commandName === "drop") {
      const subcommand = options.getSubcommand();

      // /drop lancer
      if (subcommand === "lancer") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut lancer un Drop Event.");
          return;
        }

        const titre = options.getString("titre") ?? "Drop Event BDL";
        const gagnants = options.getInteger("gagnants") ?? 5;
        const points = options.getInteger("points") ?? 5;
        const image = options.getAttachment("image");

        const channelId = interaction.channelId;
        const dropId = db.createDropEvent({
          guildId,
          channelId,
          title: titre,
          rewardPoints: points,
          maxWinners: gagnants,
          createdBy: user.id
        });

        const embed = new EmbedBuilder()
          .setTitle(`🎁 **${titre}**`)
          .setDescription(
            `Les **${gagnants} premiers** qui cliquent sur le bouton ci-dessous gagnent **${points} points** !\n\n` +
            `Bonne chance à tous !`
          )
          .setColor(0xffd700);

        if (image) {
          embed.setImage(image.url);
        }

        const { createDropButton } = require("../handlers/buttons");
        const message = await interaction.reply({
          embeds: [embed],
          components: [createDropButton(dropId)],
          fetchReply: true
        });

        // Sauvegarder l'ID du message
        db.setDropMessageId({ guildId, dropId, messageId: message.id });
        return;
      }
    }

    // =========================
    // GRAND MAÎTRE
    // =========================
    if (commandName === "grandmaitre") {
      const subcommand = options.getSubcommand();

      // /grandmaitre classement
      if (subcommand === "classement") {
        const mois = options.getInteger("mois") ?? new Date().getMonth() + 1;
        const annee = options.getInteger("annee") ?? new Date().getFullYear();
        const secrets = options.getBoolean("secrets") ?? false;

        if (secrets && !isStaff(member)) {
          await replyError(interaction, "Seul le staff peut voir le classement avec les points secrets.");
          return;
        }

        const leaderboard = db.getMonthlyLeaderboard({
          guildId,
          year: annee,
          month: mois,
          includeSecret: secrets,
          limit: 10
        });

        if (leaderboard.length === 0) {
          await interaction.reply(`Aucun point attribué pour **${mois}/${annee}**.`);
          return;
        }

        const lines = leaderboard.map((row, index) => {
          return `**${index + 1}.** <@${row.user_id}> — **${row.total} point(s)**`;
        });

        await interaction.reply({
          content: `🏆 **Classement Grand Maître — ${mois}/${annee}**${secrets ? " (secrets inclus)" : ""}\n\n${lines.join("\n")}`,
          flags: secrets ? MessageFlags.Ephemeral : undefined
        });
        return;
      }

      // /grandmaitre couronner
      if (subcommand === "couronner") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut couronner le Grand Maître.");
          return;
        }

        const mois = options.getInteger("mois") ?? new Date().getMonth() + 1;
        const annee = options.getInteger("annee") ?? new Date().getFullYear();

        const leaderboard = db.getMonthlyLeaderboard({
          guildId,
          year: annee,
          month: mois,
          includeSecret: true,
          limit: 1
        });

        if (leaderboard.length === 0) {
          await replyError(interaction, `Aucun point attribué pour **${mois}/${annee}**.`);
          return;
        }

        const winner = await client.users.fetch(leaderboard[0].user_id).catch(() => null);
        if (!winner) {
          await replyError(interaction, "Gagnant introuvable.");
          return;
        }

        const grandMaitreRoleId = getCachedSetting({ guildId, key: "grand_maitre_role_id" });
        if (!grandMaitreRoleId) {
          await replyError(interaction, "Aucun rôle Grand Maître configuré. Utilise /config pour le définir.");
          return;
        }

        const member = await guild.members.fetch(winner.id).catch(() => null);
        if (!member) {
          await replyError(interaction, "Le gagnant n'est plus sur le serveur.");
          return;
        }

        await member.roles.add(grandMaitreRoleId, `Grand Maître du Serveur — ${mois}/${annee}`).catch(async () => {
          await replyError(interaction, "Impossible de donner le rôle Grand Maître (permissions insuffisantes).");
        });

        await interaction.reply({
          content: `👑 **${winner}** est couronné **Grand Maître du Serveur** pour **${mois}/${annee}** !`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }
    }

    // =========================
    // PROFIL
    // =========================
    if (commandName === "profil") {
      const membre = options.getUser("membre") ?? user;
      const secrets = options.getBoolean("secrets") ?? false;

      if (secrets && !isStaff(member)) {
        await replyError(interaction, "Seul le staff peut voir les points secrets.");
        return;
      }

      const totalPoints = getCachedUserPoints({ guildId, userId: membre.id, includeSecret: secrets });
      const approvedRumors = db.getUserApprovedRumorCount({ guildId, userId: membre.id });
      const approvedQuests = db.getUserApprovedQuestCount({ guildId, userId: membre.id });
      const rank = db.getUserRank({ guildId, userId: membre.id, includeSecret: secrets });

      const embed = new EmbedBuilder()
        .setTitle(`👤 Profil BDL — ${membre.username}`)
        .setThumbnail(membre.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: "Points", value: `**${totalPoints}** ${secrets ? "(secrets inclus)" : ""}`, inline: true },
          { name: "Rang", value: rank ? `#${rank.rank}` : "Non classé", inline: true },
          { name: "Rumeurs approuvées", value: String(approvedRumors), inline: true },
          { name: "Quêtes validées", value: String(approvedQuests), inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    // =========================
    // BOUTIQUE
    // =========================
    if (commandName === "boutique") {
      const subcommand = options.getSubcommand();

      // /boutique voir
      if (subcommand === "voir") {
        await interaction.reply({
          content: `🛒 **Boutique BDL**\n\n${formatShopItemList()}`,
          ephemeral: true
        });
        return;
      }

      // /boutique acheter
      if (subcommand === "acheter") {
        const itemKey = options.getString("item");
        const note = options.getString("note") ? sanitizeInput(options.getString("note")) : "";

        const item = SHOP_ITEMS[itemKey];
        if (!item) {
          await replyError(interaction, "Article introuvable.");
          return;
        }

        const total = getCachedUserPoints({ guildId, userId: user.id, includeSecret: false });
        if (total < item.price) {
          await replyError(interaction, `Tu n'as pas assez de points. Prix : **${item.price}**, ton total : **${total}**.`);
          return;
        }

        const purchaseId = db.addShopPurchase({
          guildId,
          userId: user.id,
          itemKey,
          itemName: item.name,
          price: item.price,
          note
        });

        const staffChannelId = getCachedSetting({ guildId, key: "shop_staff_channel_id" });
        if (staffChannelId) {
          const staffChannel = await guild.channels.fetch(staffChannelId).catch(() => null);
          if (staffChannel && staffChannel.isTextBased()) {
            const embed = new EmbedBuilder()
              .setTitle(`🛒 Achat Boutique : ${item.name}`)
              .setDescription(`**Acheteur** : ${user}\n**Prix** : ${item.price} points`)
              .addFields(
                { name: "ID", value: `#${purchaseId}`, inline: true },
                { name: "Article", value: item.name, inline: true },
                { name: "Note", value: note || "Aucune", inline: false },
                { name: "Statut", value: "En attente de validation", inline: true }
              )
              .setFooter({ text: "Clique sur un bouton pour valider ou refuser." })
              .setTimestamp();

            const { createActionButtons } = require("../handlers/buttons");
            await staffChannel.send({
              embeds: [embed],
              components: [createActionButtons("shop", purchaseId, { approve: "Approuver l’achat", reject: "Refuser l’achat" })]
            }).catch(error => {
              logger.error("Échec de l'envoi de la demande boutique", { error: error.message });
            });
          }
        }

        await interaction.reply({
          content: `✅ Ta demande d'achat pour **${item.name}** (${item.price} points) a été envoyée au staff !\nID : **#${purchaseId}**`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // /boutique demandes
      if (subcommand === "demandes") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut voir les demandes boutique.");
          return;
        }

        const status = options.getString("statut") ?? "pending";
        const purchases = db.getShopPurchasesByStatus({ guildId, status, limit: 10 });

        if (purchases.length === 0) {
          await interaction.reply(`Aucune demande boutique **${status}** trouvée.`);
          return;
        }

        const lines = purchases.map(purchase => {
          return `**#${purchase.id}** — **${purchase.item_name}** par <@${purchase.user_id}>\nNote : ${purchase.note || "Aucune"}\nStatut : **${purchase.status}**`;
        });

        await interaction.reply({
          content: `🛒 **Demandes boutique ${status}** (10 dernières)\n\n${lines.join("\n\n")}`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // /boutique approuver
      if (subcommand === "approuver") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut approuver les demandes boutique.");
          return;
        }

        const purchaseId = options.getInteger("id");
        const purchase = db.getShopPurchaseById({ guildId, purchaseId });

        if (!purchase) {
          await replyError(interaction, `Aucune demande boutique trouvée avec l’ID #${purchaseId}.`);
          return;
        }

        db.updateShopPurchaseStatus({
          guildId,
          purchaseId,
          status: "approved",
          reviewedBy: user.id,
          reviewReason: "Achat approuvé via commande."
        });

        // Invalider le cache de l'utilisateur
        clearUserCache(guildId, purchase.user_id);

        await interaction.reply({
          content: `✅ La demande boutique **#${purchaseId}** a été **approuvée**.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // /boutique refuser
      if (subcommand === "refuser") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut refuser les demandes boutique.");
          return;
        }

        const purchaseId = options.getInteger("id");
        const reason = options.getString("raison") ? sanitizeInput(options.getString("raison")) : null;

        const purchase = db.getShopPurchaseById({ guildId, purchaseId });
        if (!purchase) {
          await replyError(interaction, `Aucune demande boutique trouvée avec l’ID #${purchaseId}.`);
          return;
        }

        db.updateShopPurchaseStatus({
          guildId,
          purchaseId,
          status: "rejected",
          reviewedBy: user.id,
          reviewReason: reason
        });

        await interaction.reply({
          content: `✅ La demande boutique **#${purchaseId}** a été **refusée**${reason ? ` : ${reason}` : ""}.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }
    }

    // =========================
    // BACKUP
    // =========================
    if (commandName === "backup") {
      const subcommand = options.getSubcommand();

      // /backup export
      if (subcommand === "export") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut exporter la base de données.");
          return;
        }

        const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "../../data/bdl.sqlite");
        if (!fs.existsSync(dbPath)) {
          await replyError(interaction, "Fichier de base de données introuvable.");
          return;
        }

        const attachment = new AttachmentBuilder(dbPath, { name: `bdl-backup-${new Date().toISOString().split("T")[0]}.sqlite` });
        await interaction.reply({
          content: "💾 Voici une copie de la base de données :",
          files: [attachment],
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      // /backup info
      if (subcommand === "info") {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut voir les infos de la base.");
          return;
        }

        const stats = db.getBackupStats();
        const activeTempRoles = db.getActiveTemporaryRoleCount();
        const pendingRumors = db.getPendingRumorCount();
        const pendingQuests = db.getPendingQuestSubmissionCount();

        const embed = new EmbedBuilder()
          .setTitle("📊 **Statistiques de la Base de Données**")
          .addFields(
            { name: "Points", value: String(stats.points), inline: true },
            { name: "Rumeurs", value: String(stats.rumors), inline: true },
            { name: "Quêtes", value: String(stats.quests), inline: true },
            { name: "Validations de quêtes", value: String(stats.questSubmissions), inline: true },
            { name: "Rôles temporaires", value: String(stats.temporaryRoles), inline: true },
            { name: "Actifs", value: String(activeTempRoles), inline: true },
            { name: "Membres Mystère", value: String(stats.mysteryGames), inline: true },
            { name: "Indices", value: String(stats.mysteryHints), inline: true },
            { name: "Propositions", value: String(stats.mysteryGuesses), inline: true },
            { name: "Drop Events", value: String(stats.dropEvents), inline: true },
            { name: "Participants aux drops", value: String(stats.dropParticipants), inline: true },
            { name: "Achats boutique", value: String(stats.shopPurchases), inline: true },
            { name: "Paramètres", value: String(stats.settings), inline: true },
            { name: "Rumeurs en attente", value: String(pendingRumors), inline: true },
            { name: "Validations en attente", value: String(pendingQuests), inline: true }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }
    }

    // =========================
    // ARCHIVE
    // =========================
    if (commandName === "archive") {
      const subcommand = options.getSubcommand();

      // /archive info
      if (subcommand === "info") {
        await interaction.reply({
          content: `🗑️ **Commandes d'archive**\n\n` +
            `Ces commandes permettent de nettoyer les anciennes données de la base.\n\n` +
            `⚠️ **Attention** : Les suppressions sont **définitives** !\n\n` +
            `**Commandes disponibles** :\n` +
            `- /archive old_drops : Supprime les Drop Events terminés.\n` +
            `- /archive old_rumors : Supprime les rumeurs refusées.\n` +
            `- /archive old_mysteries : Supprime les Membres Mystère révélés.\n` +
            `- /archive old_temp_roles : Supprime l'historique des rôles temporaires retirés.\n` +
            `- /archive vacuum : Optimise la base après nettoyage.\n\n` +
            `Utilise **confirmer=true** pour exécuter le nettoyage.`,
          ephemeral: true
        });
        return;
      }

      // /archive old_drops, old_rumors, old_mysteries, old_temp_roles, vacuum
      if (["old_drops", "old_rumors", "old_mysteries", "old_temp_roles", "vacuum"].includes(subcommand)) {
        if (!isStaff(member)) {
          await replyError(interaction, "Seul le staff peut utiliser les commandes d'archive.");
          return;
        }

        const confirmer = options.getBoolean("confirmer");
        if (!confirmer) {
          await replyError(interaction, "Utilise **confirmer=true** pour exécuter cette action.");
          return;
        }

        const jours = options.getInteger("jours") ?? (subcommand === "old_mysteries" ? 30 : 14);

        await interaction.deferReply({ ephemeral: true });

        let result;
        if (subcommand === "old_drops") {
          const beforeDate = getCleanupDate(jours);
          result = db.deleteOldDropEvents({ beforeDate });
        } else if (subcommand === "old_rumors") {
          const beforeDate = getCleanupDate(jours);
          result = db.deleteOldRejectedRumors({ beforeDate });
        } else if (subcommand === "old_mysteries") {
          const beforeDate = getCleanupDate(jours);
          result = db.deleteOldMysteryGames({ beforeDate });
        } else if (subcommand === "old_temp_roles") {
          const beforeDate = getCleanupDate(jours);
          result = db.deleteOldRemovedTemporaryRoles({ beforeDate });
        } else if (subcommand === "vacuum") {
          db.vacuumDatabase();
          result = { message: "Base optimisée avec succès." };
        }

        await interaction.followUp({
          content: `✅ **${subcommand}** exécuté avec succès.\n` +
            (result.message ? result.message : Object.entries(result).map(([key, value]) => `  - ${key}: ${value}`).join("\n")),
          ephemeral: true
        });
        return;
      }
    }

    // =========================
    // COMMANDE INCONNUE
    // =========================
    await replyError(interaction, "Commande inconnue.");

  } catch (error) {
    logger.error(`Erreur dans la commande ${commandName}`, {
      error: error.message,
      stack: error.stack,
      user: user.tag,
      guild: guild?.name
    });
    await replyError(interaction, "Une erreur est survenue. Les admins ont été notifiés.");
  }
}

module.exports = { handleCommandInteraction };
