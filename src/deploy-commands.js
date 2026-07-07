// Charge les variables du fichier .env.
// Ici, on utilise surtout DISCORD_TOKEN, CLIENT_ID et GUILD_ID.
require("dotenv").config();

// Importe les outils nécessaires de discord.js.
// REST + Routes servent à envoyer les commandes slash à Discord.
// SlashCommandBuilder sert à construire les commandes.
// ChannelType sert à limiter certaines options aux salons texte.
const {
    REST,
    Routes,
    SlashCommandBuilder,
    ChannelType
} = require("discord.js");

/*
  Ce tableau contient toutes les commandes slash du bot.

  Chaque new SlashCommandBuilder() correspond à une commande principale :
  /ping
  /points
  /rumeur
  /gazette
  etc.

  Les .addSubcommand() ajoutent des sous-commandes :
  /points ajouter
  /points retirer
  /points voir
*/
const commands = [
    /*
      /ping
      Commande simple pour vérifier que le bot répond.
    */
    new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Teste si le bot BDL fonctionne."),

    /*
      /points
      Système de points du serveur.
      Permet d’ajouter, retirer, voir, classer et consulter l’historique des points.
    */
    new SlashCommandBuilder()
        .setName("points")
        .setDescription("Gère les points BDL.")

        /*
          /points ajouter
          Réservé au staff dans index.js.
          Ajoute des points publics ou secrets à un membre.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("ajouter")
                .setDescription("Ajoute des points à un membre.")
                .addUserOption(option =>
                    option
                        .setName("membre")
                        .setDescription("Le membre qui reçoit les points.")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("nombre")
                        .setDescription("Nombre de points à ajouter.")
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(50)
                )
                .addStringOption(option =>
                    option
                        .setName("raison")
                        .setDescription("Pourquoi ces points sont ajoutés.")
                        .setRequired(true)
                        .setMaxLength(300)
                )
                .addBooleanOption(option =>
                    option
                        .setName("secret")
                        .setDescription("Les points sont-ils secrets ?")
                        .setRequired(false)
                )
        )

        /*
          /points retirer
          Ajoute une valeur négative dans la base.
          Ça permet de corriger une erreur sans supprimer l’historique.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("retirer")
                .setDescription("Retire des points à un membre.")
                .addUserOption(option =>
                    option
                        .setName("membre")
                        .setDescription("Le membre à qui retirer les points.")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("nombre")
                        .setDescription("Nombre de points à retirer.")
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(50)
                )
                .addStringOption(option =>
                    option
                        .setName("raison")
                        .setDescription("Pourquoi ces points sont retirés.")
                        .setRequired(true)
                        .setMaxLength(300)
                )
                .addBooleanOption(option =>
                    option
                        .setName("secret")
                        .setDescription("Le retrait concerne-t-il des points secrets ?")
                        .setRequired(false)
                )
        )

        /*
          /points voir
          Affiche les points d’un membre.
          L’option inclure_secrets est vérifiée dans index.js pour être réservée au staff.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("voir")
                .setDescription("Affiche les points d’un membre.")
                .addUserOption(option =>
                    option
                        .setName("membre")
                        .setDescription("Le membre à consulter.")
                        .setRequired(false)
                )
                .addBooleanOption(option =>
                    option
                        .setName("inclure_secrets")
                        .setDescription("Inclure les points secrets ? Staff uniquement.")
                        .setRequired(false)
                )
        )

        /*
          /points classement
          Affiche le classement général des points.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("classement")
                .setDescription("Affiche le classement des points.")
                .addBooleanOption(option =>
                    option
                        .setName("inclure_secrets")
                        .setDescription("Inclure les points secrets ? Staff uniquement.")
                        .setRequired(false)
                )
        )

        /*
          /points historique
          Affiche les dernières entrées de points d’un membre.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("historique")
                .setDescription("Affiche l’historique des points d’un membre.")
                .addUserOption(option =>
                    option
                        .setName("membre")
                        .setDescription("Le membre à consulter.")
                        .setRequired(false)
                )
                .addBooleanOption(option =>
                    option
                        .setName("secrets")
                        .setDescription("Inclure les points secrets ? Staff uniquement.")
                        .setRequired(false)
                )
        ),

    /*
      /rumeur
      Système de rumeurs pour la Gazette.
    */
    new SlashCommandBuilder()
        .setName("rumeur")
        .setDescription("Gère les rumeurs pour la Gazette BDL.")

        /*
          /rumeur proposer
          Permet à un membre de proposer une rumeur.
          Elle arrive ensuite en attente de validation.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("proposer")
                .setDescription("Propose une rumeur pour la Gazette.")
                .addStringOption(option =>
                    option
                        .setName("texte")
                        .setDescription("La rumeur, citation ou pépite à proposer.")
                        .setRequired(true)
                        .setMaxLength(500)
                )
                .addUserOption(option =>
                    option
                        .setName("cible")
                        .setDescription("La personne concernée, si applicable.")
                        .setRequired(false)
                )
                .addBooleanOption(option =>
                    option
                        .setName("anonyme")
                        .setDescription("Masquer ton pseudo dans la Gazette ?")
                        .setRequired(false)
                )
        )

        /*
          /rumeur liste
          Permet au staff de voir les rumeurs selon leur statut.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("liste")
                .setDescription("Liste les rumeurs en attente ou validées.")
                .addStringOption(option =>
                    option
                        .setName("statut")
                        .setDescription("Le statut des rumeurs à afficher.")
                        .setRequired(false)
                        .addChoices(
                            { name: "En attente", value: "pending" },
                            { name: "Approuvées", value: "approved" },
                            { name: "Refusées", value: "rejected" }
                        )
                )
        )

        /*
          /rumeur approuver
          Permet au staff d’approuver une rumeur avec son ID.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("approuver")
                .setDescription("Approuve une rumeur.")
                .addIntegerOption(option =>
                    option
                        .setName("id")
                        .setDescription("ID de la rumeur à approuver.")
                        .setRequired(true)
                )
        )

        /*
          /rumeur refuser
          Permet au staff de refuser une rumeur avec une raison optionnelle.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("refuser")
                .setDescription("Refuse une rumeur.")
                .addIntegerOption(option =>
                    option
                        .setName("id")
                        .setDescription("ID de la rumeur à refuser.")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("raison")
                        .setDescription("Raison du refus.")
                        .setRequired(false)
                        .setMaxLength(300)
                )
        ),

    /*
      /gazette
      Commandes liées à la Gazette BDL.
    */
    new SlashCommandBuilder()
        .setName("gazette")
        .setDescription("Prépare ou publie la Gazette BDL.")

        /*
          /gazette brouillon
          Génère une base automatique de Gazette.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("brouillon")
                .setDescription("Génère un brouillon de Gazette avec les rumeurs et points.")
        )

        /*
          /gazette publier
          Publie une Gazette complète dans le salon configuré.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("publier")
                .setDescription("Publie la Gazette BDL dans le salon Gazette.")
                .addStringOption(option =>
                    option
                        .setName("titre")
                        .setDescription("Le grand titre absurde de la semaine.")
                        .setRequired(true)
                        .setMaxLength(200)
                )
                // Pépites
                .addStringOption(option =>
                    option
                        .setName("pepites")
                        .setDescription("Les pépites de la semaine.")
                        .setRequired(true)
                        .setMaxLength(1000)
                )
                .addAttachmentOption(option =>
                    option
                        .setName("image_pepites")
                        .setDescription("Image pour les pépites.")
                        .setRequired(true)
                )
                // Stats
                .addStringOption(option =>
                    option
                        .setName("stats")
                        .setDescription("Les statistiques absurdes.")
                        .setRequired(true)
                        .setMaxLength(1000)
                )
                .addAttachmentOption(option =>
                    option
                        .setName("image_stats")
                        .setDescription("Image pour les statistiques.")
                        .setRequired(true)
                )
                // Rumeur
                .addStringOption(option =>
                    option
                        .setName("rumeur")
                        .setDescription("La rumeur de la semaine.")
                        .setRequired(true)
                        .setMaxLength(1000)
                )
                .addAttachmentOption(option =>
                    option
                        .setName("image_rumeur")
                        .setDescription("Image pour la rumeur.")
                        .setRequired(true)
                )
                // Exploit
                .addStringOption(option =>
                    option
                        .setName("exploit")
                        .setDescription("L’exploit de la semaine.")
                        .setRequired(true)
                        .setMaxLength(1000)
                )
                .addAttachmentOption(option =>
                    option
                        .setName("image_exploit")
                        .setDescription("Image pour l’exploit.")
                        .setRequired(true)
                )
                // Nominations
                .addStringOption(option =>
                    option
                        .setName("nominations")
                        .setDescription("Les rôles ou nominations de la semaine.")
                        .setRequired(true)
                        .setMaxLength(1000)
                )
                .addAttachmentOption(option =>
                    option
                        .setName("image_nominations")
                        .setDescription("Image pour les nominations.")
                        .setRequired(true)
                )
                // Bannière principale
                .addAttachmentOption(option =>
                    option
                        .setName("banniere")
                        .setDescription("Image ou bannière affichée en haut de la Gazette.")
                        .setRequired(true)
                )
        ),

    /*
      /config
      Sert à configurer les salons et le rôle staff directement depuis Discord.
    */
    new SlashCommandBuilder()
        .setName("config")
        .setDescription("Configure les salons et rôles utilisés par le bot BDL.")

        /*
          /config salon
          Enregistre les salons utilisés par les différents systèmes du bot.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("salon")
                .setDescription("Définit un salon pour une fonction du bot.")
                .addStringOption(option =>
                    option
                        .setName("type")
                        .setDescription("Le type de salon à configurer.")
                        .setRequired(true)
                        .addChoices(
                            { name: "Gazette", value: "gazette_channel_id" },
                            { name: "Rumeurs staff", value: "rumors_staff_channel_id" },
                            { name: "Quêtes", value: "quests_channel_id" },
                            { name: "Quêtes staff", value: "quests_staff_channel_id" },
                            { name: "Membre Mystère", value: "mystery_channel_id" },
                            { name: "Points", value: "points_channel_id" },
                            { name: "Events", value: "events_channel_id" },
                            { name: "Annonces", value: "announcements_channel_id" },
                            { name: "Bump", value: "bump_channel_id" },
                            { name: "Boutique staff", value: "shop_staff_channel_id" }
                        )
                )
                .addChannelOption(option =>
                    option
                        .setName("salon")
                        .setDescription("Le salon Discord à utiliser.")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)
                )
        )

        /*
          /config role_staff
          Définit le rôle qui aura accès aux commandes staff BDL.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("role_staff")
                .setDescription("Définit le rôle staff autorisé à utiliser les commandes BDL.")
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("Le rôle staff BDL.")
                        .setRequired(true)
                )
        )

        /*
          /config role_bump
          Définit le rôle à ping pour les rappels de bump.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("role_bump")
                .setDescription("Définit le rôle à ping pour les rappels de bump.")
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("Le rôle qui doit être ping pour bump.")
                        .setRequired(true)
                )
        )

        /*
          /config voir
          Affiche toute la configuration enregistrée.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("voir")
                .setDescription("Affiche la configuration actuelle du bot.")
        ),

    /*
      /quete
      Système de quêtes hebdomadaires.
    */
    new SlashCommandBuilder()
        .setName("quete")
        .setDescription("Gère les quêtes hebdomadaires BDL.")

        /*
          /quete publier
          Crée une quête avec points et rôle optionnel.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("publier")
                .setDescription("Publie une nouvelle quête.")
                .addStringOption(option =>
                    option
                        .setName("titre")
                        .setDescription("Titre de la quête.")
                        .setRequired(true)
                        .setMaxLength(100)
                )
                .addStringOption(option =>
                    option
                        .setName("description")
                        .setDescription("Description de la quête.")
                        .setRequired(true)
                        .setMaxLength(1000)
                )
                .addIntegerOption(option =>
                    option
                        .setName("points")
                        .setDescription("Nombre de points gagnés si la quête est validée.")
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(10)
                )
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("Rôle bonus à donner si la quête est validée.")
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option
                        .setName("jours_role")
                        .setDescription("Durée du rôle bonus en jours.")
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(31)
                )
                .addAttachmentOption(option =>
                    option
                        .setName("image")
                        .setDescription("Image d’ambiance pour la quête.")
                        .setRequired(false)
                )
        )

        /*
          /quete liste
          Affiche les quêtes actives.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("liste")
                .setDescription("Affiche les quêtes actives.")
        )

        /*
          /quete valider
          Permet à un membre de demander la validation d’une quête.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("valider")
                .setDescription("Demande la validation d’une quête.")
                .addIntegerOption(option =>
                    option
                        .setName("id")
                        .setDescription("ID de la quête.")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("preuve")
                        .setDescription("Preuve ou explication de ta validation.")
                        .setRequired(true)
                        .setMaxLength(1000)
                )
                .addAttachmentOption(option =>
                    option
                        .setName("photo")
                        .setDescription("Photo ou capture d’écran comme preuve.")
                        .setRequired(false)
                )
                .addUserOption(option =>
                    option
                        .setName("membre_mentionne")
                        .setDescription("Membre qui peut confirmer ta preuve.")
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName("lien")
                        .setDescription("Lien complémentaire vers une preuve.")
                        .setRequired(false)
                        .setMaxLength(500)
                )
        )

        /*
          /quete submissions
          Liste les validations de quêtes pour le staff.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("submissions")
                .setDescription("Liste les validations de quêtes en attente.")
                .addStringOption(option =>
                    option
                        .setName("statut")
                        .setDescription("Statut à afficher.")
                        .setRequired(false)
                        .addChoices(
                            { name: "En attente", value: "pending" },
                            { name: "Approuvées", value: "approved" },
                            { name: "Refusées", value: "rejected" }
                        )
                )
        )

        /*
          /quete approuver
          Approuve une validation et attribue les points/rôles.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("approuver")
                .setDescription("Approuve une validation de quête.")
                .addIntegerOption(option =>
                    option
                        .setName("id")
                        .setDescription("ID de la validation.")
                        .setRequired(true)
                )
        )

        /*
          /quete refuser
          Refuse une validation.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("refuser")
                .setDescription("Refuse une validation de quête.")
                .addIntegerOption(option =>
                    option
                        .setName("id")
                        .setDescription("ID de la validation.")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("raison")
                        .setDescription("Raison du refus.")
                        .setRequired(false)
                        .setMaxLength(300)
                )
        )

        /*
          /quete fermer
          Ferme une quête pour empêcher de nouvelles validations.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("fermer")
                .setDescription("Ferme une quête active.")
                .addIntegerOption(option =>
                    option
                        .setName("id")
                        .setDescription("ID de la quête à fermer.")
                        .setRequired(true)
                )
        ),

    /*
      /role
      Système de rôles temporaires.
    */
    new SlashCommandBuilder()
        .setName("role")
        .setDescription("Gère les rôles temporaires BDL.")

        /*
          /role temporaire
          Donne un rôle temporaire à un membre.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("temporaire")
                .setDescription("Donne un rôle temporaire à un membre.")
                .addUserOption(option =>
                    option
                        .setName("membre")
                        .setDescription("Le membre qui reçoit le rôle.")
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName("role")
                        .setDescription("Le rôle à donner temporairement.")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("jours")
                        .setDescription("Durée du rôle en jours.")
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(31)
                )
                .addStringOption(option =>
                    option
                        .setName("raison")
                        .setDescription("Pourquoi ce rôle est donné.")
                        .setRequired(false)
                        .setMaxLength(300)
                )
        )

        /*
          /role liste
          Liste les rôles temporaires encore actifs.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("liste")
                .setDescription("Liste les rôles temporaires actifs.")
        ),

    /*
      /mystere
      Système du Membre Mystère.
    */
    new SlashCommandBuilder()
        .setName("mystere")
        .setDescription("Gère le Membre Mystère BDL.")

        /*
          /mystere set
          Définit le membre mystère de la semaine.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("set")
                .setDescription("Définit le Membre Mystère de la semaine.")
                .addUserOption(option =>
                    option
                        .setName("membre")
                        .setDescription("Le membre mystère.")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("semaine")
                        .setDescription("Identifiant de semaine, ex: 2026-S21.")
                        .setRequired(false)
                        .setMaxLength(30)
                )
                .addAttachmentOption(option =>
                    option
                        .setName("image")
                        .setDescription("Image d’ambiance pour le Membre Mystère.")
                        .setRequired(false)
                )
        )

        /*
          /mystere indice
          Ajoute un indice et peut le publier immédiatement.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("indice")
                .setDescription("Ajoute ou publie un indice.")
                .addIntegerOption(option =>
                    option
                        .setName("numero")
                        .setDescription("Numéro de l’indice.")
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(3)
                )
                .addStringOption(option =>
                    option
                        .setName("texte")
                        .setDescription("Texte de l’indice.")
                        .setRequired(true)
                        .setMaxLength(500)
                )
                .addBooleanOption(option =>
                    option
                        .setName("publier")
                        .setDescription("Publier immédiatement l’indice ?")
                        .setRequired(false)
                )
        )

        /*
          /mystere guess
          Permet aux membres de proposer une réponse.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("guess")
                .setDescription("Propose une réponse pour le Membre Mystère.")
                .addUserOption(option =>
                    option
                        .setName("membre")
                        .setDescription("La personne que tu penses être le Membre Mystère.")
                        .setRequired(true)
                )
        )

        /*
          /mystere reveal
          Révèle le membre mystère et donne les points.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("reveal")
                .setDescription("Révèle le Membre Mystère et donne les points au gagnant.")
        )

        /*
          /mystere statut
          Affiche l’état de la partie.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("statut")
                .setDescription("Affiche le statut du Membre Mystère.")
        ),

    /*
      /drop
      Système de Drop Event avec bouton de participation.
    */
    new SlashCommandBuilder()
        .setName("drop")
        .setDescription("Gère les Drop Events BDL.")

        /*
          /drop lancer
          Lance un drop avec un nombre limité de gagnants.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("lancer")
                .setDescription("Lance un Drop Event avec bouton de participation.")
                .addStringOption(option =>
                    option
                        .setName("titre")
                        .setDescription("Titre du Drop Event.")
                        .setRequired(false)
                        .setMaxLength(150)
                )
                .addIntegerOption(option =>
                    option
                        .setName("gagnants")
                        .setDescription("Nombre de gagnants.")
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(20)
                )
                .addIntegerOption(option =>
                    option
                        .setName("points")
                        .setDescription("Nombre de points par gagnant.")
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(10)
                )
                .addAttachmentOption(option =>
                    option
                        .setName("image")
                        .setDescription("Image d’ambiance pour le drop.")
                        .setRequired(false)
                )
        ),

    /*
      /grandmaitre
      Système mensuel du Grand Maître du Serveur.
    */
    new SlashCommandBuilder()
        .setName("grandmaitre")
        .setDescription("Gère le titre mensuel de Grand Maître du Serveur.")

        /*
          /grandmaitre classement
          Affiche le classement mensuel.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("classement")
                .setDescription("Affiche le classement mensuel.")
                .addIntegerOption(option =>
                    option
                        .setName("mois")
                        .setDescription("Mois à consulter, entre 1 et 12.")
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addIntegerOption(option =>
                    option
                        .setName("annee")
                        .setDescription("Année à consulter.")
                        .setRequired(false)
                        .setMinValue(2024)
                        .setMaxValue(2100)
                )
                .addBooleanOption(option =>
                    option
                        .setName("secrets")
                        .setDescription("Inclure les points secrets ? Staff uniquement.")
                        .setRequired(false)
                )
        )

        /*
          /grandmaitre couronner
          Donne le rôle Grand Maître au gagnant du mois.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("couronner")
                .setDescription("Couronne le Grand Maître du Serveur du mois.")
                .addIntegerOption(option =>
                    option
                        .setName("mois")
                        .setDescription("Mois à couronner, entre 1 et 12.")
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(12)
                )
                .addIntegerOption(option =>
                    option
                        .setName("annee")
                        .setDescription("Année à couronner.")
                        .setRequired(false)
                        .setMinValue(2024)
                        .setMaxValue(2100)
                )
        ),

    /*
      /profil
      Affiche un résumé d’un membre.
    */
    new SlashCommandBuilder()
        .setName("profil")
        .setDescription("Affiche le profil BDL d’un membre.")
        .addUserOption(option =>
            option
                .setName("membre")
                .setDescription("Le membre à consulter.")
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option
                .setName("secrets")
                .setDescription("Inclure les points secrets ? Staff uniquement.")
                .setRequired(false)
        ),

    /*
      /boutique
      Boutique de points BDL (NOUVEAUX OBJETS UNIQUEMENT).
    */
    new SlashCommandBuilder()
        .setName("boutique")
        .setDescription("Boutique de points BDL.")

        /*
          /boutique voir
          Affiche les objets disponibles dans la boutique.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("voir")
                .setDescription("Affiche la boutique de points BDL.")
        )

        /*
          /boutique acheter
          Crée une demande d'achat.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("acheter")
                .setDescription("Demande à acheter une récompense avec tes points.")
                .addStringOption(option =>
                    option
                        .setName("item")
                        .setDescription("La récompense à acheter.")
                        .setRequired(true)
                        .addChoices(
                            // ===== NOUVEAUX OBJETS UNIQUEMENT =====
                            { name: "Emoji personnalisé — 10 pts", value: "emoji_personnalise" },
                            { name: "Commande personnalisée — 20 pts", value: "commande_personnalisee" },
                            { name: "Boost d'XP — 5 pts", value: "xp_boost" },
                            { name: "Nude de colo — 15 pts", value: "nude_colo" },
                            { name: "Trophée personnalisé — 30 pts", value: "trophee_personnalise" },
                            { name: "Thème de Gazette — 10 pts", value: "theme_gazette" },
                            { name: "Choisir le film — 8 pts", value: "film_soiree" }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName("note")
                        .setDescription("Précision pour le staff.")
                        .setRequired(false)
                        .setMaxLength(500)
                )
        )

        /*
          /boutique demandes
          Liste les demandes d'achat.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("demandes")
                .setDescription("Liste les demandes d'achat boutique. Staff uniquement.")
                .addStringOption(option =>
                    option
                        .setName("statut")
                        .setDescription("Statut des demandes à afficher.")
                        .setRequired(false)
                        .addChoices(
                            { name: "En attente", value: "pending" },
                            { name: "Approuvées", value: "approved" },
                            { name: "Refusées", value: "rejected" }
                        )
                )
        )

        /*
          /boutique approuver
          Valide une demande et retire les points.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("approuver")
                .setDescription("Approuve une demande boutique et retire les points.")
                .addIntegerOption(option =>
                    option
                        .setName("id")
                        .setDescription("ID de la demande boutique.")
                        .setRequired(true)
                )
        )

        /*
          /boutique refuser
          Refuse une demande.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("refuser")
                .setDescription("Refuse une demande boutique.")
                .addIntegerOption(option =>
                    option
                        .setName("id")
                        .setDescription("ID de la demande boutique.")
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName("raison")
                        .setDescription("Raison du refus.")
                        .setRequired(false)
                        .setMaxLength(300)
                )
        ),

    /*
      /backup
      Sauvegarde et infos de la base de données.
    */
    new SlashCommandBuilder()
        .setName("backup")
        .setDescription("Gère les sauvegardes du bot BDL.")

        /*
          /backup export
          Envoie le fichier SQLite au staff.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("export")
                .setDescription("Exporte la base de données SQLite du bot.")
        )

        /*
          /backup info
          Affiche les statistiques de la base.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("info")
                .setDescription("Affiche des informations sur la base de données.")
        ),

    /*
      /archive
      Commandes de nettoyage de la base.
    */
    new SlashCommandBuilder()
        .setName("archive")
        .setDescription("Nettoie les anciennes données du bot BDL.")

        /*
          /archive old_drops
          Supprime les vieux Drop Events terminés.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("old_drops")
                .setDescription("Supprime les anciens Drop Events terminés.")
                .addBooleanOption(option =>
                    option
                        .setName("confirmer")
                        .setDescription("Confirmer le nettoyage.")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("jours")
                        .setDescription("Supprimer les drops terminés depuis plus de X jours.")
                        .setRequired(false)
                        .setMinValue(7)
                        .setMaxValue(365)
                )
        )

        /*
          /archive old_rumors
          Supprime les vieilles rumeurs refusées.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("old_rumors")
                .setDescription("Supprime les anciennes rumeurs refusées.")
                .addBooleanOption(option =>
                    option
                        .setName("confirmer")
                        .setDescription("Confirmer le nettoyage.")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("jours")
                        .setDescription("Supprimer les rumeurs refusées depuis plus de X jours.")
                        .setRequired(false)
                        .setMinValue(7)
                        .setMaxValue(365)
                )
        )

        /*
          /archive old_mysteries
          Supprime les anciennes parties Membre Mystère terminées.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("old_mysteries")
                .setDescription("Supprime les anciens Membres Mystères révélés ou fermés.")
                .addBooleanOption(option =>
                    option
                        .setName("confirmer")
                        .setDescription("Confirmer le nettoyage.")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("jours")
                        .setDescription("Supprimer les parties terminées depuis plus de X jours.")
                        .setRequired(false)
                        .setMinValue(14)
                        .setMaxValue(365)
                )
        )

        /*
          /archive old_temp_roles
          Supprime l’historique des anciens rôles temporaires déjà retirés.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("old_temp_roles")
                .setDescription("Supprime les anciens rôles temporaires déjà retirés.")
                .addBooleanOption(option =>
                    option
                        .setName("confirmer")
                        .setDescription("Confirmer le nettoyage.")
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName("jours")
                        .setDescription("Supprimer les rôles retirés depuis plus de X jours.")
                        .setRequired(false)
                        .setMinValue(7)
                        .setMaxValue(365)
                )
        )

        /*
          /archive vacuum
          Optimise la base SQLite après nettoyage.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("vacuum")
                .setDescription("Optimise le fichier SQLite après nettoyage.")
                .addBooleanOption(option =>
                    option
                        .setName("confirmer")
                        .setDescription("Confirmer l’optimisation.")
                        .setRequired(true)
                )
        )

        /*
          /archive info
          Explique les commandes d’archive.
        */
        .addSubcommand(subcommand =>
            subcommand
                .setName("info")
                .setDescription("Explique ce qui peut être nettoyé.")
        )
].map(command => command.toJSON());

/*
  Crée un client REST Discord.
  Il utilise le token du bot pour pouvoir envoyer les commandes slash à Discord.
*/
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

/*
  Fonction principale de déploiement.

  Elle envoie toutes les commandes du tableau commands au serveur Discord indiqué
  par CLIENT_ID et GUILD_ID dans le fichier .env.
*/
async function main() {
    try {
        console.log("🔄 Déploiement des commandes slash...");

        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),
            { body: commands }
        );

        console.log("✅ Commandes slash déployées avec succès !");
    } catch (error) {
        console.error("❌ Erreur pendant le déploiement des commandes :");
        console.error(error);
    }
}

// Lance le déploiement.
main();
