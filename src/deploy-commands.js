const { REST, Routes } = require('discord.js');
const { clientId, guildId, token } = require('./config.json');

const commands = [
  {
    name: 'shop',
    description: 'Affiche la boutique des récompenses',
  },
  {
    name: 'buy',
    description: 'Acheter un item de la boutique',
    options: [
      {
        name: 'item',
        description: 'Le nom de l\'item à acheter',
        type: 3,
        required: true,
        choices: [
          { name: 'emoji_personnalise', value: 'emoji_personnalise' },
          { name: 'commande_personnalisee', value: 'commande_personnalisee' },
          { name: 'xp_boost', value: 'xp_boost' },
          { name: 'nude_colo', value: 'nude_colo' },
          { name: 'trophee_personnalise', value: 'trophee_personnalise' },
          { name: 'theme_gazette', value: 'theme_gazette' },
          { name: 'film_soiree', value: 'film_soiree' },
        ],
      },
    ],
  },
  {
    name: 'points',
    description: 'Voir vos points ou ceux d\'un autre membre',
    options: [
      {
        name: 'user',
        description: 'Le membre dont vous voulez voir les points',
        type: 6,
        required: false,
      },
    ],
  },
  {
    name: 'leaderboard',
    description: 'Affiche le classement des membres par points',
  },
  {
    name: 'monthly',
    description: 'Affiche le classement mensuel des membres par points',
  },
  {
    name: 'gazette',
    description: 'Gérer la gazette du serveur',
    options: [
      {
        name: 'brouillon',
        description: 'Créer un brouillon de gazette',
        type: 1,
      },
      {
        name: 'publier',
        description: 'Publier la gazette',
        type: 1,
        options: [
          { name: 'title', description: 'Titre de la gazette', type: 3, required: true },
          { name: 'banner', description: 'URL de la bannière', type: 3, required: true },
          { name: 'image_pepites', description: 'URL de l\'image pour les pépites', type: 3, required: false },
          { name: 'image_stats', description: 'URL de l\'image pour les stats', type: 3, required: false },
          { name: 'image_rumeur', description: 'URL de l\'image pour les rumeurs', type: 3, required: false },
          { name: 'image_exploit', description: 'URL de l\'image pour les exploits', type: 3, required: false },
          { name: 'image_nominations', description: 'URL de l\'image pour les nominations', type: 3, required: false },
          { name: 'pepites', description: 'Contenu des pépites', type: 3, required: false },
          { name: 'stats', description: 'Contenu des stats', type: 3, required: false },
          { name: 'rumeur', description: 'Contenu des rumeurs', type: 3, required: false },
          { name: 'exploit', description: 'Contenu des exploits', type: 3, required: false },
          { name: 'nominations', description: 'Contenu des nominations', type: 3, required: false },
        ],
      },
    ],
  },
  {
    name: 'quest',
    description: 'Gérer les quêtes',
    options: [
      {
        name: 'create',
        description: 'Créer une nouvelle quête',
        type: 1,
        options: [
          { name: 'name', description: 'Nom de la quête', type: 3, required: true },
          { name: 'description', description: 'Description de la quête', type: 3, required: true },
          { name: 'reward', description: 'Récompense en points', type: 4, required: true },
        ],
      },
      {
        name: 'validate',
        description: 'Valider une quête pour un membre',
        type: 1,
        options: [
          { name: 'user', description: 'Le membre à qui valider la quête', type: 6, required: true },
          { name: 'quest', description: 'Le nom de la quête', type: 3, required: true },
        ],
      },
    ],
  },
  {
    name: 'mystere',
    description: 'Gérer le membre mystère',
    options: [
      { name: 'statut', description: 'Voir le statut du membre mystère', type: 1 },
      {
        name: 'set',
        description: 'Définir un nouveau membre mystère',
        type: 1,
        options: [{ name: 'user', description: 'Le membre à définir comme mystère', type: 6, required: true }],
      },
      { name: 'reveal', description: 'Révéler le membre mystère', type: 1 },
    ],
  },
  {
    name: 'rumor',
    description: 'Gérer les rumeurs',
    options: [
      {
        name: 'add',
        description: 'Ajouter une rumeur',
        type: 1,
        options: [{ name: 'content', description: 'Contenu de la rumeur', type: 3, required: true }],
      },
      {
        name: 'list',
        description: 'Lister les rumeurs',
        type: 1,
        options: [
          {
            name: 'status',
            description: 'Filtrer par statut',
            type: 3,
            required: false,
            choices: [
              { name: 'pending', value: 'pending' },
              { name: 'approved', value: 'approved' },
              { name: 'rejected', value: 'rejected' },
            ],
          },
        ],
      },
    ],
  },
  {
    name: 'config',
    description: 'Configurer les paramètres du bot',
    options: [
      {
        name: 'set',
        description: 'Définir une valeur de configuration',
        type: 1,
        options: [
          {
            name: 'key',
            description: 'Clé de configuration',
            type: 3,
            required: true,
            choices: [
              { name: 'role_mini_maitre', value: 'role_mini_maitre' },
              { name: 'staff_channel', value: 'staff_channel' },
              { name: 'shop_channel', value: 'shop_channel' },
              { name: 'gazette_channel', value: 'gazette_channel' },
            ],
          },
          { name: 'value', description: 'Valeur à définir', type: 3, required: true },
        ],
      },
      {
        name: 'get',
        description: 'Obtenir une valeur de configuration',
        type: 1,
        options: [
          {
            name: 'key',
            description: 'Clé de configuration',
            type: 3,
            required: true,
            choices: [
              { name: 'role_mini_maitre', value: 'role_mini_maitre' },
              { name: 'staff_channel', value: 'staff_channel' },
              { name: 'shop_channel', value: 'shop_channel' },
              { name: 'gazette_channel', value: 'gazette_channel' },
            ],
          },
        ],
      },
    ],
  },
];

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();
