const { REST, Routes } = require('discord.js');
const { clientId, guildId, token } = require('./config.json');

const commands = [
  // ===== PING =====
  {
    name: 'ping',
    description: 'Vérifie que le bot est en ligne.'
  },

  // ===== POINTS =====
  {
    name: 'points',
    description: 'Gère les points des membres.',
    options: [
      {
        name: 'ajouter',
        description: 'Ajoute des points à un membre.',
        type: 1,
        options: [
          { name: 'membre', description: 'Le membre à créditer.', type: 6, required: true },
          { name: 'nombre', description: 'Le nombre de points à ajouter.', type: 4, required: true },
          { name: 'raison', description: 'La raison de l’ajout.', type: 3, required: true },
          { name: 'secret', description: 'Points secrets (visibles uniquement par le staff).', type: 5, required: false }
        ]
      },
      {
        name: 'retirer',
        description: 'Retire des points à un membre.',
        type: 1,
        options: [
          { name: 'membre', description: 'Le membre à débiter.', type: 6, required: true },
          { name: 'nombre', description: 'Le nombre de points à retirer.', type: 4, required: true },
          { name: 'raison', description: 'La raison du retrait.', type: 3, required: true },
          { name: 'secret', description: 'Points secrets (visibles uniquement par le staff).', type: 5, required: false }
        ]
      },
      {
        name: 'voir',
        description: 'Voir les points d’un membre.',
        type: 1,
        options: [
          { name: 'membre', description: 'Le membre à vérifier (laisser vide pour toi).', type: 6, required: false },
          { name: 'inclure_secrets', description: 'Inclure les points secrets.', type: 5, required: false }
        ]
      },
      {
        name: 'classement',
        description: 'Affiche le classement des points.',
        type: 1,
        options: [
          { name: 'inclure_secrets', description: 'Inclure les points secrets.', type: 5, required: false }
        ]
      },
      {
        name: 'historique',
        description: 'Voir l’historique des points d’un membre.',
        type: 1,
        options: [
          { name: 'membre', description: 'Le membre à vérifier (laisser vide pour toi).', type: 6, required: false },
          { name: 'secrets', description: 'Inclure les points secrets.', type: 5, required: false }
        ]
      }
    ]
  },

  // ===== RUMEURS =====
  {
    name: 'rumeur',
    description: 'Gère les rumeurs.',
    options: [
      {
        name: 'proposer',
        description: 'Propose une nouvelle rumeur.',
        type: 1,
        options: [
          { name: 'texte', description: 'Le texte de la rumeur.', type: 3, required: true },
          { name: 'cible', description: 'La cible de la rumeur (optionnel).', type: 6, required: false },
          { name: 'anonyme', description: 'Rester anonyme.', type: 5, required: false }
        ]
      },
      {
        name: 'liste',
        description: 'Liste les rumeurs (staff uniquement).',
        type: 1,
        options: [
          { name: 'statut', description: 'Filtrer par statut.', type: 3, required: false, choices: [
            { name: 'En attente', value: 'pending' },
            { name: 'Approuvées', value: 'approved' },
            { name: 'Refusées', value: 'rejected' }
          ]}
        ]
      },
      {
        name: 'approuver',
        description: 'Approuve une rumeur (staff uniquement).',
        type: 1,
        options: [
          { name: 'id', description: 'L’ID de la rumeur.', type: 4, required: true }
        ]
      },
      {
        name: 'refuser',
        description: 'Refuse une rumeur (staff uniquement).',
        type: 1,
        options: [
          { name: 'id', description: 'L’ID de la rumeur.', type: 4, required: true },
          { name: 'raison', description: 'La raison du refus.', type: 3, required: false }
        ]
      }
    ]
  },

  // ===== GAZETTE =====
  {
    name: 'gazette',
    description: 'Gère la Gazette BDL.',
    options: [
      {
        name: 'brouillon',
        description: 'Génère un brouillon automatique de Gazette.',
        type: 1
      },
      {
        name: 'publier',
        description: 'Publie la Gazette.',
        type: 1,
        options: [
          { name: 'titre', description: 'Titre de la Gazette.', type: 3, required: true },
          { name: 'pepites', description: 'Contenu des Pépites de la semaine.', type: 3, required: false },
          { name: 'stats', description: 'Contenu des Statistiques absurdes.', type: 3, required: false },
          { name: 'rumeur', description: 'Contenu de la Rumeur de la semaine.', type: 3, required: false },
          { name: 'exploit', description: 'Contenu de l’Exploit de la semaine.', type: 3, required: false },
          { name: 'nominations', description: 'Contenu des Nominations.', type: 3, required: false },
          { name: 'banniere', description: 'Bannière de la Gazette.', type: 11, required: false },
          { name: 'image_pepites', description: 'Image pour les Pépites.', type: 11, required: false },
          { name: 'image_stats', description: 'Image pour les Statistiques.', type: 11, required: false },
          { name: 'image_rumeur', description: 'Image pour la Rumeur.', type: 11, required: false },
          { name: 'image_exploit', description: 'Image pour l’Exploit.', type: 11, required: false },
          { name: 'image_nominations', description: 'Image pour les Nominations.', type: 11, required: false }
        ]
      }
    ]
  },

  // ===== CONFIG =====
  {
    name: 'config',
    description: 'Configure les paramètres du bot.',
    options: [
      {
        name: 'salon',
        description: 'Configure un salon pour une fonctionnalité.',
        type: 1,
        options: [
          { name: 'type', description: 'Le type de salon.', type: 3, required: true, choices: [
            { name: 'Gazette', value: 'gazette_channel_id' },
            { name: 'Rumeurs (Staff)', value: 'rumors_staff_channel_id' },
            { name: 'Quêtes', value: 'quests_channel_id' },
            { name: 'Membre Mystère', value: 'mystery_channel_id' },
            { name: 'Boutique (Staff)', value: 'shop_staff_channel_id' },
            { name: 'Bump', value: 'bump_channel_id' }
          ]},
          { name: 'salon', description: 'Le salon Discord.', type: 7, required: true }
        ]
      },
      {
        name: 'role_staff',
        description: 'Configure le rôle staff.',
        type: 1,
        options: [
          { name: 'role', description: 'Le rôle staff.', type: 8, required: true }
        ]
      },
      {
        name: 'role_bump',
        description: 'Configure le rôle pour les rappels de bump.',
        type: 1,
        options: [
          { name: 'role', description: 'Le rôle bump.', type: 8, required: true }
        ]
      },
      {
        name: 'role_grand_maitre',
        description: 'Configure le rôle Mini Maître.',
        type: 1,
        options: [
          { name: 'role', description: 'Le rôle Mini Maître.', type: 8, required: true }
        ]
      },
      {
        name: 'voir',
        description: 'Affiche toutes les configurations.',
        type: 1
      }
    ]
  },

  // ===== QUÊTES =====
  {
    name: 'quete',
    description: 'Gère les quêtes.',
    options: [
      {
        name: 'publier',
        description: 'Publie une nouvelle quête (staff uniquement).',
        type: 1,
        options: [
          { name: 'titre', description: 'Le titre de la quête.', type: 3, required: true },
          { name: 'description', description: 'La description de la quête.', type: 3, required: true },
          { name: 'points', description: 'Le nombre de points de récompense.', type: 4, required: false },
          { name: 'role', description: 'Le rôle temporaire à attribuer (optionnel).', type: 8, required: false },
          { name: 'jours_role', description: 'Durée du rôle en jours (par défaut: 7).', type: 4, required: false },
          { name: 'image', description: 'Image de la quête.', type: 11, required: false }
        ]
      },
      {
        name: 'liste',
        description: 'Liste les quêtes actives.',
        type: 1
      },
      {
        name: 'valider',
        description: 'Soumet une validation de quête.',
        type: 1,
        options: [
          { name: 'id', description: 'L’ID de la quête.', type: 4, required: true },
          { name: 'preuve', description: 'La preuve de validation (texte).', type: 3, required: true },
          { name: 'photo', description: 'Preuve sous forme d’image.', type: 11, required: false },
          { name: 'membre_mentionne', description: 'Membre mentionné dans la preuve.', type: 6, required: false },
          { name: 'lien', description: 'Lien de preuve (URL).', type: 3, required: false }
        ]
      },
      {
        name: 'submissions',
        description: 'Liste les validations de quêtes (staff uniquement).',
        type: 1,
        options: [
          { name: 'statut', description: 'Filtrer par statut.', type: 3, required: false, choices: [
            { name: 'En attente', value: 'pending' },
            { name: 'Approuvées', value: 'approved' },
            { name: 'Refusées', value: 'rejected' }
          ]}
        ]
      },
      {
        name: 'approuver',
        description: 'Approuve une validation de quête (staff uniquement).',
        type: 1,
        options: [
          { name: 'id', description: 'L’ID de la validation.', type: 4, required: true }
        ]
      },
      {
        name: 'refuser',
        description: 'Refuse une validation de quête (staff uniquement).',
        type: 1,
        options: [
          { name: 'id', description: 'L’ID de la validation.', type: 4, required: true },
          { name: 'raison', description: 'La raison du refus.', type: 3, required: false }
        ]
      },
      {
        name: 'fermer',
        description: 'Ferme une quête (staff uniquement).',
        type: 1,
        options: [
          { name: 'id', description: 'L’ID de la quête.', type: 4, required: true }
        ]
      }
    ]
  },

  // ===== RÔLES TEMPORAIRES =====
  {
    name: 'role',
    description: 'Gère les rôles temporaires.',
    options: [
      {
        name: 'temporaire',
        description: 'Donne un rôle temporaire à un membre (staff uniquement).',
        type: 1,
        options: [
          { name: 'membre', description: 'Le membre à créditer.', type: 6, required: true },
          { name: 'role', description: 'Le rôle à attribuer.', type: 8, required: true },
          { name: 'jours', description: 'La durée en jours.', type: 4, required: true },
          { name: 'raison', description: 'La raison de l’attribution.', type: 3, required: false }
        ]
      },
      {
        name: 'liste',
        description: 'Liste les rôles temporaires actifs.',
        type: 1
      }
    ]
  },

  // ===== MEMBRE MYSTÈRE =====
  {
    name: 'mystere',
    description: 'Gère le Membre Mystère.',
    options: [
      {
        name: 'set',
        description: 'Définit un nouveau Membre Mystère (staff uniquement).',
        type: 1,
        options: [
          { name: 'membre', description: 'Le membre mystère.', type: 6, required: true },
          { name: 'semaine', description: 'La semaine (ex: 2026-S21).', type: 3, required: false },
          { name: 'image', description: 'Image pour l’annonce.', type: 11, required: false }
        ]
      },
      {
        name: 'indice',
        description: 'Ajoute un indice (staff uniquement).',
        type: 1,
        options: [
          { name: 'numero', description: 'Le numéro de l’indice.', type: 4, required: true },
          { name: 'texte', description: 'Le texte de l’indice.', type: 3, required: true },
          { name: 'publier', description: 'Publier immédiatement.', type: 5, required: false }
        ]
      },
      {
        name: 'guess',
        description: 'Fait une proposition pour le Membre Mystère.',
        type: 1,
        options: [
          { name: 'membre', description: 'Le membre que tu penses être le mystère.', type: 6, required: true }
        ]
      },
      {
        name: 'reveal',
        description: 'Révèle le Membre Mystère (staff uniquement).',
        type: 1
      },
      {
        name: 'statut',
        description: 'Affiche le statut du Membre Mystère actuel.',
        type: 1
      }
    ]
  },

  // ===== DROP EVENTS =====
  {
    name: 'drop',
    description: 'Gère les Drop Events.',
    options: [
      {
        name: 'lancer',
        description: 'Lance un nouveau Drop Event (staff uniquement).',
        type: 1,
        options: [
          { name: 'titre', description: 'Le titre du Drop Event.', type: 3, required: false },
          { name: 'gagnants', description: 'Nombre de gagnants (par défaut: 5).', type: 4, required: false },
          { name: 'points', description: 'Points par gagnant (par défaut: 1).', type: 4, required: false },
          { name: 'image', description: 'Image du Drop Event.', type: 11, required: false }
        ]
      }
    ]
  },

  // ===== MINI MAÎTRE =====
  {
    name: 'grandmaitre',
    description: 'Gère le Mini Maître.',
    options: [
      {
        name: 'classement',
        description: 'Affiche le classement pour le Mini Maître (staff uniquement).',
        type: 1,
        options: [
          { name: 'mois', description: 'Le mois (1-12).', type: 4, required: false },
          { name: 'annee', description: 'L’année (ex: 2026).', type: 4, required: false }
        ]
      },
      {
        name: 'couronner',
        description: 'Couronne le Mini Maître (staff uniquement).',
        type: 1,
        options: [
          { name: 'mois', description: 'Le mois (1-12).', type: 4, required: false },
          { name: 'annee', description: 'L’année (ex: 2026).', type: 4, required: false }
        ]
      }
    ]
  },

  // ===== PROFIL =====
  {
    name: 'profil',
    description: 'Affiche le profil BDL d’un membre.',
    options: [
      { name: 'membre', description: 'Le membre à afficher (laisser vide pour toi).', type: 6, required: false },
      { name: 'secrets', description: 'Inclure les points secrets (staff uniquement).', type: 5, required: false }
    ]
  },

  // ===== BOUTIQUE =====
  {
    name: 'boutique',
    description: 'Boutique de récompenses.',
    options: [
      {
        name: 'voir',
        description: 'Affiche les articles disponibles.',
        type: 1
      },
      {
        name: 'acheter',
        description: 'Achète un article.',
        type: 1,
        options: [
          { name: 'item', description: 'L’article à acheter.', type: 3, required: true, choices: [
            { name: '🎨 Emoji personnalisé sur le serveur', value: 'emoji_personnalise' },
            { name: '💻 Commande personnalisée', value: 'commande_personnalisee' },
            { name: '⚡ Boost d\'XP', value: 'xp_boost' },
            { name: '📸 Nude de colo', value: 'nude_colo' },
            { name: '🏆 Trophée personnalisé', value: 'trophee_personnalise' },
            { name: '📰 Thème de Gazette', value: 'theme_gazette' },
            { name: '🎬 Choisir le film des soirées popcorn', value: 'film_soiree' }
          ]},
          { name: 'note', description: 'Note ou détail pour ta demande.', type: 3, required: false }
        ]
      },
      {
        name: 'demandes',
        description: 'Liste les demandes d’achat (staff uniquement).',
        type: 1,
        options: [
          { name: 'statut', description: 'Filtrer par statut.', type: 3, required: false, choices: [
            { name: 'En attente', value: 'pending' },
            { name: 'Approuvées', value: 'approved' },
            { name: 'Refusées', value: 'rejected' }
          ]}
        ]
      },
      {
        name: 'approuver',
        description: 'Approuve une demande d’achat (staff uniquement).',
        type: 1,
        options: [
          { name: 'id', description: 'L’ID de la demande.', type: 4, required: true }
        ]
      },
      {
        name: 'refuser',
        description: 'Refuse une demande d’achat (staff uniquement).',
        type: 1,
        options: [
          { name: 'id', description: 'L’ID de la demande.', type: 4, required: true },
          { name: 'raison', description: 'La raison du refus.', type: 3, required: false }
        ]
      }
    ]
  },

  // ===== BACKUP =====
  {
    name: 'backup',
    description: 'Gère les sauvegardes et infos.',
    options: [
      {
        name: 'export',
        description: 'Exporte la base de données (staff uniquement).',
        type: 1
      },
      {
        name: 'info',
        description: 'Affiche les infos de la base (staff uniquement).',
        type: 1
      }
    ]
  },

  // ===== ARCHIVE =====
  {
    name: 'archive',
    description: 'Nettoie les anciennes données.',
    options: [
      {
        name: 'old_drops',
        description: 'Supprime les anciens Drop Events (staff uniquement).',
        type: 1,
        options: [
          { name: 'confirmer', description: 'Confirmer la suppression.', type: 5, required: true },
          { name: 'jours', description: 'Nombre de jours (par défaut: 30).', type: 4, required: false }
        ]
      },
      {
        name: 'old_rumors',
        description: 'Supprime les anciennes rumeurs refusées (staff uniquement).',
        type: 1,
        options: [
          { name: 'confirmer', description: 'Confirmer la suppression.', type: 5, required: true },
          { name: 'jours', description: 'Nombre de jours (par défaut: 30).', type: 4, required: false }
        ]
      },
      {
        name: 'old_mysteries',
        description: 'Supprime les anciennes parties Membre Mystère (staff uniquement).',
        type: 1,
        options: [
          { name: 'confirmer', description: 'Confirmer la suppression.', type: 5, required: true },
          { name: 'jours', description: 'Nombre de jours (par défaut: 30).', type: 4, required: false }
        ]
      },
      {
        name: 'old_temp_roles',
        description: 'Supprime les anciens rôles temporaires (staff uniquement).',
        type: 1,
        options: [
          { name: 'confirmer', description: 'Confirmer la suppression.', type: 5, required: true },
          { name: 'jours', description: 'Nombre de jours (par défaut: 30).', type: 4, required: false }
        ]
      },
      {
        name: 'vacuum',
        description: 'Optimise la base de données (staff uniquement).',
        type: 1,
        options: [
          { name: 'confirmer', description: 'Confirmer l’optimisation.', type: 5, required: true }
        ]
      },
      {
        name: 'info',
        description: 'Affiche l’aide des commandes d’archive.',
        type: 1
      }
    ]
  }
];

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
