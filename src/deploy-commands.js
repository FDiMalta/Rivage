const { REST, Routes, ApplicationCommandOptionType } = require('discord.js');
const path = require('path');
require('dotenv').config();

// Chargement des variables d'environnement
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
    console.error("❌ Erreur : CLIENT_ID, GUILD_ID ou DISCORD_TOKEN manquant dans .env");
    process.exit(1);
}

const commands = [
    // ===== PING =====
    {
        name: "ping",
        description: "Vérifie que le bot est en ligne."
    },

    // ===== POINTS =====
    {
        name: "points",
        description: "Gère les points des membres.",
        options: [
            {
                name: "ajouter",
                description: "Ajoute des points à un membre.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "membre", description: "Le membre à récompenser.", type: ApplicationCommandOptionType.User, required: true },
                    { name: "nombre", description: "Nombre de points à ajouter.", type: ApplicationCommandOptionType.Integer, required: true },
                    { name: "raison", description: "Raison de l'ajout.", type: ApplicationCommandOptionType.String, required: true },
                    { name: "secret", description: "Points secrets (visibles uniquement par le staff).", type: ApplicationCommandOptionType.Boolean }
                ]
            },
            {
                name: "retirer",
                description: "Retire des points à un membre.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "membre", description: "Le membre à pénaliser.", type: ApplicationCommandOptionType.User, required: true },
                    { name: "nombre", description: "Nombre de points à retirer.", type: ApplicationCommandOptionType.Integer, required: true },
                    { name: "raison", description: "Raison du retrait.", type: ApplicationCommandOptionType.String, required: true },
                    { name: "secret", description: "Points secrets.", type: ApplicationCommandOptionType.Boolean }
                ]
            },
            {
                name: "voir",
                description: "Affiche les points d'un membre.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "membre", description: "Le membre à vérifier.", type: ApplicationCommandOptionType.User },
                    { name: "inclure_secrets", description: "Inclure les points secrets.", type: ApplicationCommandOptionType.Boolean }
                ]
            },
            {
                name: "classement",
                description: "Affiche le classement des points.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "inclure_secrets", description: "Inclure les points secrets.", type: ApplicationCommandOptionType.Boolean }
                ]
            },
            {
                name: "historique",
                description: "Affiche l'historique des points d'un membre.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "membre", description: "Le membre à vérifier.", type: ApplicationCommandOptionType.User },
                    { name: "secrets", description: "Inclure l'historique des points secrets.", type: ApplicationCommandOptionType.Boolean }
                ]
            }
        ]
    },

    // ===== RUMEURS =====
    {
        name: "rumeur",
        description: "Gère les rumeurs de la Gazette.",
        options: [
            {
                name: "proposer",
                description: "Propose une nouvelle rumeur.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "texte", description: "Le contenu de la rumeur.", type: ApplicationCommandOptionType.String, required: true },
                    { name: "cible", description: "Le membre visé par la rumeur.", type: ApplicationCommandOptionType.User },
                    { name: "anonyme", description: "Rester anonyme.", type: ApplicationCommandOptionType.Boolean }
                ]
            },
            {
                name: "liste",
                description: "Liste les rumeurs en attente.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "statut", description: "Filtrer par statut.", type: ApplicationCommandOptionType.String, choices: [
                        { name: "En attente", value: "pending" },
                        { name: "Approuvées", value: "approved" },
                        { name: "Refusées", value: "rejected" }
                    ]}
                ]
            },
            {
                name: "approuver",
                description: "Approuve une rumeur.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "id", description: "L'ID de la rumeur.", type: ApplicationCommandOptionType.Integer, required: true }
                ]
            },
            {
                name: "refuser",
                description: "Refuse une rumeur.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "id", description: "L'ID de la rumeur.", type: ApplicationCommandOptionType.Integer, required: true },
                    { name: "raison", description: "Raison du refus.", type: ApplicationCommandOptionType.String }
                ]
            }
        ]
    },

    // ===== GAZETTE =====
    {
        name: "gazette",
        description: "Gère la Gazette BDL.",
        options: [
            {
                name: "brouillon",
                description: "Génère un brouillon automatique de Gazette.",
                type: ApplicationCommandOptionType.Subcommand
            },
            {
                name: "publier",
                description: "Publie la Gazette avec images personnalisées.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "titre", description: "Titre de la Gazette.", type: ApplicationCommandOptionType.String, required: true },
                    { name: "pepites", description: "Contenu des pépites de la semaine.", type: ApplicationCommandOptionType.String },
                    { name: "stats", description: "Contenu des statistiques absurdes.", type: ApplicationCommandOptionType.String },
                    { name: "rumeur", description: "Contenu de la rumeur de la semaine.", type: ApplicationCommandOptionType.String },
                    { name: "exploit", description: "Contenu de l'exploit de la semaine.", type: ApplicationCommandOptionType.String },
                    { name: "nominations", description: "Contenu des nominations.", type: ApplicationCommandOptionType.String },
                    { name: "banniere", description: "Bannière principale de la Gazette.", type: ApplicationCommandOptionType.Attachment },
                    { name: "image_pepites", description: "Image pour les pépites.", type: ApplicationCommandOptionType.Attachment },
                    { name: "image_stats", description: "Image pour les statistiques.", type: ApplicationCommandOptionType.Attachment },
                    { name: "image_rumeur", description: "Image pour la rumeur.", type: ApplicationCommandOptionType.Attachment },
                    { name: "image_exploit", description: "Image pour l'exploit.", type: ApplicationCommandOptionType.Attachment },
                    { name: "image_nominations", description: "Image pour les nominations.", type: ApplicationCommandOptionType.Attachment }
                ]
            }
        ]
    },

    // ===== CONFIG =====
    {
        name: "config",
        description: "Configure le bot BDL.",
        options: [
            {
                name: "salon",
                description: "Configure un salon pour une fonctionnalité.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "type", description: "Type de salon à configurer.", type: ApplicationCommandOptionType.String, required: true, choices: [
                        { name: "Gazette", value: "gazette_channel_id" },
                        { name: "Quêtes", value: "quests_channel_id" },
                        { name: "Membre Mystère", value: "mystery_channel_id" },
                        { name: "Bump", value: "bump_channel_id" },
                        { name: "Rumeurs (Staff)", value: "rumors_staff_channel_id" },
                        { name: "Boutique (Staff)", value: "shop_staff_channel_id" }
                    ]},
                    { name: "salon", description: "Le salon à configurer.", type: ApplicationCommandOptionType.Channel, required: true }
                ]
            },
            {
                name: "role_staff",
                description: "Configure le rôle staff.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "role", description: "Le rôle staff.", type: ApplicationCommandOptionType.Role, required: true }
                ]
            },
            {
                name: "role_bump",
                description: "Configure le rôle pour les rappels de bump.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "role", description: "Le rôle bump.", type: ApplicationCommandOptionType.Role, required: true }
                ]
            },
            {
                name: "role_grand_maitre",
                description: "Configure le rôle Grand Maître.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "role", description: "Le rôle Grand Maître.", type: ApplicationCommandOptionType.Role, required: true }
                ]
            },
            {
                name: "voir",
                description: "Affiche la configuration actuelle.",
                type: ApplicationCommandOptionType.Subcommand
            }
        ]
    },

    // ===== QUÊTES =====
    {
        name: "quete",
        description: "Gère les quêtes BDL.",
        options: [
            {
                name: "publier",
                description: "Publie une nouvelle quête.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "titre", description: "Titre de la quête.", type: ApplicationCommandOptionType.String, required: true },
                    { name: "description", description: "Description de la quête.", type: ApplicationCommandOptionType.String, required: true },
                    { name: "points", description: "Nombre de points de récompense.", type: ApplicationCommandOptionType.Integer, required: true },
                    { name: "role", description: "Rôle temporaire à attribuer.", type: ApplicationCommandOptionType.Role },
                    { name: "jours_role", description: "Durée du rôle temporaire (en jours).", type: ApplicationCommandOptionType.Integer },
                    { name: "image", description: "Image de la quête.", type: ApplicationCommandOptionType.Attachment }
                ]
            },
            {
                name: "liste",
                description: "Liste les quêtes actives.",
                type: ApplicationCommandOptionType.Subcommand
            },
            {
                name: "valider",
                description: "Valide une quête en soumettant une preuve.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "id", description: "ID de la quête à valider.", type: ApplicationCommandOptionType.Integer, required: true },
                    { name: "preuve", description: "Preuve de validation (texte).", type: ApplicationCommandOptionType.String, required: true },
                    { name: "photo", description: "Photo de preuve.", type: ApplicationCommandOptionType.Attachment },
                    { name: "membre_mentionne", description: "Membre mentionné dans la preuve.", type: ApplicationCommandOptionType.User },
                    { name: "lien", description: "Lien de preuve.", type: ApplicationCommandOptionType.String }
                ]
            },
            {
                name: "submissions",
                description: "Liste les validations de quêtes.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "statut", description: "Filtrer par statut.", type: ApplicationCommandOptionType.String, choices: [
                        { name: "En attente", value: "pending" },
                        { name: "Approuvées", value: "approved" },
                        { name: "Refusées", value: "rejected" }
                    ]}
                ]
            },
            {
                name: "approuver",
                description: "Approuve une validation de quête.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "id", description: "ID de la validation.", type: ApplicationCommandOptionType.Integer, required: true }
                ]
            },
            {
                name: "refuser",
                description: "Refuse une validation de quête.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "id", description: "ID de la validation.", type: ApplicationCommandOptionType.Integer, required: true },
                    { name: "raison", description: "Raison du refus.", type: ApplicationCommandOptionType.String }
                ]
            },
            {
                name: "fermer",
                description: "Ferme une quête.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "id", description: "ID de la quête à fermer.", type: ApplicationCommandOptionType.Integer, required: true }
                ]
            }
        ]
    },

    // ===== RÔLES TEMPORAIRES =====
    {
        name: "role",
        description: "Gère les rôles temporaires.",
        options: [
            {
                name: "temporaire",
                description: "Donne un rôle temporaire à un membre.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "membre", description: "Le membre à récompenser.", type: ApplicationCommandOptionType.User, required: true },
                    { name: "role", description: "Le rôle temporaire.", type: ApplicationCommandOptionType.Role, required: true },
                    { name: "jours", description: "Durée en jours.", type: ApplicationCommandOptionType.Integer, required: true },
                    { name: "raison", description: "Raison du rôle.", type: ApplicationCommandOptionType.String }
                ]
            },
            {
                name: "liste",
                description: "Liste les rôles temporaires actifs.",
                type: ApplicationCommandOptionType.Subcommand
            }
        ]
    },

    // ===== MEMBRE MYSTÈRE =====
    {
        name: "mystere",
        description: "Gère le jeu Membre Mystère.",
        options: [
            {
                name: "set",
                description: "Définit un nouveau Membre Mystère.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "membre", description: "Le membre mystère.", type: ApplicationCommandOptionType.User, required: true },
                    { name: "semaine", description: "Semaine du jeu (ex: 2026-S21).", type: ApplicationCommandOptionType.String },
                    { name: "image", description: "Image du Membre Mystère.", type: ApplicationCommandOptionType.Attachment }
                ]
            },
            {
                name: "indice",
                description: "Ajoute un indice pour le Membre Mystère.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "numero", description: "Numéro de l'indice.", type: ApplicationCommandOptionType.Integer, required: true },
                    { name: "texte", description: "Contenu de l'indice.", type: ApplicationCommandOptionType.String, required: true },
                    { name: "publier", description: "Publier l'indice immédiatement.", type: ApplicationCommandOptionType.Boolean }
                ]
            },
            {
                name: "guess",
                description: "Propose une réponse pour le Membre Mystère.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "membre", description: "Le membre que tu penses être le mystère.", type: ApplicationCommandOptionType.User, required: true }
                ]
            },
            {
                name: "reveal",
                description: "Révèle le Membre Mystère.",
                type: ApplicationCommandOptionType.Subcommand
            },
            {
                name: "statut",
                description: "Affiche le statut du Membre Mystère actuel.",
                type: ApplicationCommandOptionType.Subcommand
            }
        ]
    },

    // ===== DROP EVENTS =====
    {
        name: "drop",
        description: "Gère les Drop Events.",
        options: [
            {
                name: "lancer",
                description: "Lance un nouveau Drop Event.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "titre", description: "Titre du Drop Event.", type: ApplicationCommandOptionType.String },
                    { name: "gagnants", description: "Nombre de gagnants.", type: ApplicationCommandOptionType.Integer },
                    { name: "points", description: "Points par gagnant.", type: ApplicationCommandOptionType.Integer },
                    { name: "image", description: "Image du Drop Event.", type: ApplicationCommandOptionType.Attachment }
                ]
            }
        ]
    },

    // ===== GRAND MAÎTRE =====
    {
        name: "grandmaitre",
        description: "Gère le classement mensuel Grand Maître.",
        options: [
            {
                name: "classement",
                description: "Affiche le classement mensuel (visible uniquement par le staff).",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "mois", description: "Mois (1-12).", type: ApplicationCommandOptionType.Integer },
                    { name: "annee", description: "Année.", type: ApplicationCommandOptionType.Integer }
                ]
            },
            {
                name: "couronner",
                description: "Couronne le Grand Maître du mois (basé sur points + secrets).",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "mois", description: "Mois (1-12).", type: ApplicationCommandOptionType.Integer },
                    { name: "annee", description: "Année.", type: ApplicationCommandOptionType.Integer }
                ]
            }
        ]
    },

    // ===== PROFIL =====
    {
        name: "profil",
        description: "Affiche le profil BDL d'un membre.",
        options: [
            { name: "membre", description: "Le membre à afficher.", type: ApplicationCommandOptionType.User },
            { name: "secrets", description: "Inclure les points secrets (staff uniquement).", type: ApplicationCommandOptionType.Boolean }
        ]
    },

    // ===== BOUTIQUE =====
    {
        name: "boutique",
        description: "Gère la boutique de points BDL.",
        options: [
            {
                name: "voir",
                description: "Affiche les articles disponibles.",
                type: ApplicationCommandOptionType.Subcommand
            },
            {
                name: "acheter",
                description: "Achète un article de la boutique.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "item", description: "L'article à acheter.", type: ApplicationCommandOptionType.String, required: true, choices: [
                        { name: "🎨 Emoji personnalisé", value: "emoji_personnalise" },
                        { name: "💻 Commande personnalisée", value: "commande_personnalisee" },
                        { name: "⚡ Boost d'XP", value: "xp_boost" },
                        { name: "📸 Nude de colo (fausse)", value: "nude_colo" },
                        { name: "🏆 Trophée personnalisé", value: "trophee_personnalise" },
                        { name: "📰 Thème de Gazette", value: "theme_gazette" },
                        { name: "🎬 Film des soirées popcorn", value: "film_soiree" }
                    ]},
                    { name: "note", description: "Note pour le staff.", type: ApplicationCommandOptionType.String }
                ]
            },
            {
                name: "demandes",
                description: "Liste les demandes d'achat.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "statut", description: "Filtrer par statut.", type: ApplicationCommandOptionType.String, choices: [
                        { name: "En attente", value: "pending" },
                        { name: "Approuvées", value: "approved" },
                        { name: "Refusées", value: "rejected" }
                    ]}
                ]
            },
            {
                name: "approuver",
                description: "Approuve une demande d'achat.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "id", description: "ID de la demande.", type: ApplicationCommandOptionType.Integer, required: true }
                ]
            },
            {
                name: "refuser",
                description: "Refuse une demande d'achat.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "id", description: "ID de la demande.", type: ApplicationCommandOptionType.Integer, required: true },
                    { name: "raison", description: "Raison du refus.", type: ApplicationCommandOptionType.String }
                ]
            }
        ]
    },

    // ===== BACKUP =====
    {
        name: "backup",
        description: "Gère les sauvegardes et statistiques.",
        options: [
            {
                name: "export",
                description: "Exporte la base de données.",
                type: ApplicationCommandOptionType.Subcommand
            },
            {
                name: "info",
                description: "Affiche les statistiques de la base.",
                type: ApplicationCommandOptionType.Subcommand
            }
        ]
    },

    // ===== ARCHIVE =====
    {
        name: "archive",
        description: "Nettoie les anciennes données.",
        options: [
            {
                name: "old_drops",
                description: "Supprime les anciens Drop Events.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "confirmer", description: "Confirmer la suppression.", type: ApplicationCommandOptionType.Boolean, required: true },
                    { name: "jours", description: "Nombre de jours.", type: ApplicationCommandOptionType.Integer }
                ]
            },
            {
                name: "old_rumors",
                description: "Supprime les anciennes rumeurs refusées.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "confirmer", description: "Confirmer la suppression.", type: ApplicationCommandOptionType.Boolean, required: true },
                    { name: "jours", description: "Nombre de jours.", type: ApplicationCommandOptionType.Integer }
                ]
            },
            {
                name: "old_mysteries",
                description: "Supprime les anciens jeux Membre Mystère.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "confirmer", description: "Confirmer la suppression.", type: ApplicationCommandOptionType.Boolean, required: true },
                    { name: "jours", description: "Nombre de jours.", type: ApplicationCommandOptionType.Integer }
                ]
            },
            {
                name: "old_temp_roles",
                description: "Supprime l'historique des anciens rôles temporaires.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "confirmer", description: "Confirmer la suppression.", type: ApplicationCommandOptionType.Boolean, required: true },
                    { name: "jours", description: "Nombre de jours.", type: ApplicationCommandOptionType.Integer }
                ]
            },
            {
                name: "vacuum",
                description: "Optimise la base de données.",
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: "confirmer", description: "Confirmer l'optimisation.", type: ApplicationCommandOptionType.Boolean, required: true }
                ]
            },
            {
                name: "info",
                description: "Affiche l'aide des commandes d'archivage.",
                type: ApplicationCommandOptionType.Subcommand
            }
        ]
    }
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

(async () => {
    try {
        console.log('🔄 Début du déploiement des commandes...');

        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );

        console.log('✅ Commandes déployées avec succès !');
        console.log('⏳ Attendez 1-5 minutes pour que Discord synchronise les modifications.');
        console.log('⚠️  N\'oubliez pas de configurer le rôle Grand Maître avec: /config role_grand_maitre role:@RôleGrandMaitre');
    } catch (error) {
        console.error('❌ Erreur lors du déploiement des commandes :', error);
    }
})();
