const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { token, guildId } = require('./config.json');
const sqlite3 = require('sqlite3').verbose();

// Database setup
const db = new sqlite3.Database('./bot.db');

// Initialize database tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, points INTEGER DEFAULT 0, monthly_points INTEGER DEFAULT 0)`);
  db.run(`CREATE TABLE IF NOT EXISTS shop_items (name TEXT PRIMARY KEY, price INTEGER, description TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS user_items (user_id TEXT, item_name TEXT, PRIMARY KEY (user_id, item_name))`);
  db.run(`CREATE TABLE IF NOT EXISTS rumors (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  db.run(`CREATE TABLE IF NOT EXISTS quests (name TEXT PRIMARY KEY, description TEXT, reward INTEGER)`);
  db.run(`CREATE TABLE IF NOT EXISTS user_quests (user_id TEXT, quest_name TEXT, completed INTEGER DEFAULT 0, PRIMARY KEY (user_id, quest_name))`);
  db.run(`CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS mystere (user_id TEXT, revealed INTEGER DEFAULT 0)`);

  // Insert default shop items with custom prices
  const shopItems = [
    { name: 'emoji_personnalise', price: 50, description: 'Un emoji personnalisé pour le serveur' },
    { name: 'commande_personnalisee', price: 60, description: 'Une commande personnalisée pour le bot' },
    { name: 'xp_boost', price: 15, description: 'Boost de XP pour une durée limitée' },
    { name: 'nude_colo', price: 200, description: 'Un nude de la colo (spécial)' },
    { name: 'trophee_personnalise', price: 100, description: 'Un trophée personnalisé dans le hall of fame' },
    { name: 'theme_gazette', price: 30, description: 'Choisir le thème de la prochaine gazette' },
    { name: 'film_soiree', price: 20, description: 'Choisir le film pour la soirée cinéma' },
  ];

  shopItems.forEach(item => {
    db.run(`INSERT OR IGNORE INTO shop_items (name, price, description) VALUES (?, ?, ?)`,
      [item.name, item.price, item.description]);
  });
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

// Helper functions
function getConfig(key, callback) {
  db.get(`SELECT value FROM config WHERE key = ?`, [key], (err, row) => {
    callback(err, row ? row.value : null);
  });
}

function setConfig(key, value, callback) {
  db.run(`INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`, [key, value], callback);
}

function addPoints(userId, points, callback) {
  db.run(`INSERT OR IGNORE INTO users (user_id, points, monthly_points) VALUES (?, 0, 0)`, [userId]);
  db.run(`UPDATE users SET points = points + ? WHERE user_id = ?`, [points, userId], (err) => {
    if (err) return callback(err);
    db.run(`UPDATE users SET monthly_points = monthly_points + ? WHERE user_id = ?`, [points, userId], callback);
  });
}

function getUserTotalPoints(userId, callback) {
  db.get(`SELECT points FROM users WHERE user_id = ?`, [userId], (err, row) => {
    callback(err, row ? row.points : 0);
  });
}

function getMonthlyPoints(userId, callback) {
  db.get(`SELECT monthly_points FROM users WHERE user_id = ?`, [userId], (err, row) => {
    callback(err, row ? row.monthly_points : 0);
  });
}

function getLeaderboard(callback) {
  db.all(`SELECT user_id, points FROM users ORDER BY points DESC LIMIT 10`, callback);
}

function getMonthlyLeaderboard(callback) {
  db.all(`SELECT user_id, monthly_points FROM users ORDER BY monthly_points DESC LIMIT 10`, callback);
}

function addRumor(content, callback) {
  db.run(`INSERT INTO rumors (content, status) VALUES (?, ?)`, [content, 'pending'], callback);
}

function getRumorsByStatus(status, callback) {
  db.all(`SELECT * FROM rumors WHERE status = ? ORDER BY created_at DESC`, [status], callback);
}

function updateRumorStatus(id, status, callback) {
  db.run(`UPDATE rumors SET status = ? WHERE id = ?`, [status, id], callback);
}

function createQuest(name, description, reward, callback) {
  db.run(`INSERT OR REPLACE INTO quests (name, description, reward) VALUES (?, ?, ?)`,
    [name, description, reward], callback);
}

function completeQuest(userId, questName, callback) {
  db.run(`INSERT OR IGNORE INTO user_quests (user_id, quest_name, completed) VALUES (?, ?, 0)`,
    [userId, questName]);
  db.run(`UPDATE user_quests SET completed = 1 WHERE user_id = ? AND quest_name = ?`,
    [userId, questName], (err) => {
    if (err) return callback(err);
    db.get(`SELECT reward FROM quests WHERE name = ?`, [questName], (err, row) => {
      if (err) return callback(err);
      if (row) {
        addPoints(userId, row.reward, callback);
      } else {
        callback(null);
      }
    });
  });
}

function getQuest(name, callback) {
  db.get(`SELECT * FROM quests WHERE name = ?`, [name], callback);
}

function setMystere(userId, callback) {
  db.run(`DELETE FROM mystere`, []);
  db.run(`INSERT INTO mystere (user_id, revealed) VALUES (?, 0)`, [userId], callback);
}

function getMystere(callback) {
  db.get(`SELECT * FROM mystere WHERE revealed = 0 LIMIT 1`, callback);
}

function revealMystere(callback) {
  db.run(`UPDATE mystere SET revealed = 1 WHERE revealed = 0`, callback);
}

function hasItem(userId, itemName, callback) {
  db.get(`SELECT 1 FROM user_items WHERE user_id = ? AND item_name = ?`, [userId, itemName],
    (err, row) => callback(err, !!row));
}

function addItem(userId, itemName, callback) {
  db.run(`INSERT OR IGNORE INTO user_items (user_id, item_name) VALUES (?, ?)`, [userId, itemName], callback);
}

function buyItem(userId, itemName, callback) {
  db.get(`SELECT price FROM shop_items WHERE name = ?`, [itemName], (err, row) => {
    if (err) return callback(err);
    if (!row) return callback(new Error('Item not found'));

    getUserTotalPoints(userId, (err, points) => {
      if (err) return callback(err);
      if (points < row.price) return callback(new Error('Not enough points'));

      db.run(`UPDATE users SET points = points - ? WHERE user_id = ?`, [row.price, userId], (err) => {
        if (err) return callback(err);
        addItem(userId, itemName, callback);
      });
    });
  });
}

function formatShopItemList() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT name, price, description FROM shop_items ORDER BY price ASC`, (err, rows) => {
      if (err) return reject(err);

      const items = rows.map(item => {
        return `**${item.name}** - ${item.price} points : ${item.description}`;
      }).join('\n');

      resolve(items);
    });
  });
}

function isStaff(member) {
  return member.roles.cache.some(role => role.name === 'Staff' || role.name === 'Mini Maître');
}

function getStaffChannel(guild) {
  return new Promise((resolve) => {
    getConfig('staff_channel', (err, channelId) => {
      if (err || !channelId) {
        resolve(guild.channels.cache.find(c => c.name === 'staff'));
      } else {
        resolve(guild.channels.cache.get(channelId));
      }
    });
  });
}

function getMiniMaitreRole(guild) {
  return new Promise((resolve) => {
    getConfig('role_mini_maitre', (err, roleId) => {
      if (err || !roleId) {
        resolve(guild.roles.cache.find(r => r.name === 'Mini Maître'));
      } else {
        resolve(guild.roles.cache.get(roleId));
      }
    });
  });
}

// Command handling
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, guild, member, user } = interaction;

  try {
    switch (commandName) {
      case 'shop':
        const shopItems = await formatShopItemList();
        const shopEmbed = new EmbedBuilder()
          .setTitle('🏪 Boutique du serveur BDL')
          .setDescription(shopItems)
          .setColor('#FFD700')
          .setFooter({ text: 'Utilisez /buy [item] pour acheter' });
        await interaction.reply({ embeds: [shopEmbed], ephemeral: false });
        break;

      case 'buy':
        const itemName = options.getString('item');

        buyItem(user.id, itemName, async (err) => {
          if (err) {
            if (err.message === 'Not enough points') {
              await interaction.reply({
                content: `❌ Vous n'avez pas assez de points pour acheter **${itemName}** !`,
                ephemeral: true
              });
            } else {
              await interaction.reply({
                content: `❌ Erreur lors de l'achat: ${err.message}`,
                ephemeral: true
              });
            }
            return;
          }

          await interaction.reply({
            content: `✅ Félicitations ! Vous avez acheté **${itemName}** !`,
            ephemeral: false
          });
        });
        break;

      case 'points':
        const targetUser = options.getUser('user') || user;
        getUserTotalPoints(targetUser.id, (err, points) => {
          if (err) {
            interaction.reply({ content: '❌ Erreur lors de la récupération des points.', ephemeral: true });
            return;
          }

          getMonthlyPoints(targetUser.id, (err, monthlyPoints) => {
            const embed = new EmbedBuilder()
              .setTitle(`💰 Points de ${targetUser.tag}`)
              .setDescription(`**Total:** ${points} points\n**Ce mois:** ${monthlyPoints} points`)
              .setColor('#00FF00');
            interaction.reply({ embeds: [embed], ephemeral: false });
          });
        });
        break;

      case 'leaderboard':
        getLeaderboard((err, rows) => {
          if (err) {
            interaction.reply({ content: '❌ Erreur lors de la récupération du classement.', ephemeral: true });
            return;
          }

          const leaderboardText = rows.map((row, index) => {
            const user = guild.members.cache.get(row.user_id);
            const displayName = user ? user.displayName : `Utilisateur ${row.user_id}`;
            return `${index + 1}. **${displayName}** - ${row.points} points`;
          }).join('\n');

          const embed = new EmbedBuilder()
            .setTitle('🏆 Classement des points')
            .setDescription(leaderboardText || 'Aucun utilisateur dans le classement.')
            .setColor('#FFD700');
          interaction.reply({ embeds: [embed], ephemeral: false });
        });
        break;

      case 'monthly':
        getMonthlyLeaderboard((err, rows) => {
          if (err) {
            interaction.reply({ content: '❌ Erreur lors de la récupération du classement mensuel.', ephemeral: true });
            return;
          }

          const leaderboardText = rows.map((row, index) => {
            const user = guild.members.cache.get(row.user_id);
            const displayName = user ? user.displayName : `Utilisateur ${row.user_id}`;
            return `${index + 1}. **${displayName}** - ${row.monthly_points} points`;
          }).join('\n');

          const embed = new EmbedBuilder()
            .setTitle('📅 Classement mensuel des points')
            .setDescription(leaderboardText || 'Aucun utilisateur dans le classement mensuel.')
            .setColor('#00FF00');
          interaction.reply({ embeds: [embed], ephemeral: false });
        });
        break;

      case 'gazette':
        const subcommand = options.getSubcommand();

        if (subcommand === 'brouillon') {
          if (!isStaff(member)) {
            await interaction.reply({
              content: '❌ Vous n\'avez pas la permission d\'utiliser cette commande.',
              ephemeral: true
            });
            return;
          }

          await interaction.reply({
            content: '✏️ Brouillon de gazette créé. Utilisez `/gazette publier` pour publier.',
            ephemeral: true
          });
        }

        else if (subcommand === 'publier') {
          if (!isStaff(member)) {
            await interaction.reply({
              content: '❌ Vous n\'avez pas la permission d\'utiliser cette commande.',
              ephemeral: true
            });
            return;
          }

          const title = options.getString('title');
          const banner = options.getString('banner');
          const imagePepites = options.getString('image_pepites');
          const imageStats = options.getString('image_stats');
          const imageRumeur = options.getString('image_rumeur');
          const imageExploit = options.getString('image_exploit');
          const imageNominations = options.getString('image_nominations');
          const pepites = options.getString('pepites');
          const stats = options.getString('stats');
          const rumeur = options.getString('rumeur');
          const exploit = options.getString('exploit');
          const nominations = options.getString('nominations');

          const embeds = [];

          // First embed: Title + Banner
          const titleEmbed = new EmbedBuilder()
            .setTitle(title)
            .setImage(banner)
            .setColor('#FF00FF');
          embeds.push(titleEmbed);

          // Separate embeds for each section
          if (pepites) {
            const pepitesEmbed = new EmbedBuilder()
              .setTitle('💎 Pépites')
              .setDescription(pepites)
              .setColor('#FFFF00');
            if (imagePepites) pepitesEmbed.setImage(imagePepites);
            embeds.push(pepitesEmbed);
          }

          if (stats) {
            const statsEmbed = new EmbedBuilder()
              .setTitle('📊 Stats')
              .setDescription(stats)
              .setColor('#00FFFF');
            if (imageStats) statsEmbed.setImage(imageStats);
            embeds.push(statsEmbed);
          }

          if (rumeur) {
            const rumeurEmbed = new EmbedBuilder()
              .setTitle('🗣️ Rumeur')
              .setDescription(rumeur)
              .setColor('#FF00FF');
            if (imageRumeur) rumeurEmbed.setImage(imageRumeur);
            embeds.push(rumeurEmbed);
          }

          if (exploit) {
            const exploitEmbed = new EmbedBuilder()
              .setTitle('🏆 Exploit')
              .setDescription(exploit)
              .setColor('#00FF00');
            if (imageExploit) exploitEmbed.setImage(imageExploit);
            embeds.push(exploitEmbed);
          }

          if (nominations) {
            const nominationsEmbed = new EmbedBuilder()
              .setTitle('🎖️ Nominations')
              .setDescription(nominations)
              .setColor('#FFD700');
            if (imageNominations) nominationsEmbed.setImage(imageNominations);
            embeds.push(nominationsEmbed);
          }

          await interaction.reply({ embeds, ephemeral: false });
        }
        break;

      case 'quest':
        const questSubcommand = options.getSubcommand();

        if (questSubcommand === 'create') {
          if (!isStaff(member)) {
            await interaction.reply({
              content: '❌ Vous n\'avez pas la permission d\'utiliser cette commande.',
              ephemeral: true
            });
            return;
          }

          const name = options.getString('name');
          const description = options.getString('description');
          const reward = options.getInteger('reward');

          createQuest(name, description, reward, async (err) => {
            if (err) {
              await interaction.reply({
                content: `❌ Erreur lors de la création de la quête: ${err.message}`,
                ephemeral: true
              });
              return;
            }
            await interaction.reply({
              content: `✅ Quête **${name}** créée avec une récompense de ${reward} points !`,
              ephemeral: false
            });
          });
        }

        else if (questSubcommand === 'validate') {
          if (!isStaff(member)) {
            await interaction.reply({
              content: '❌ Vous n\'avez pas la permission d\'utiliser cette commande.',
              ephemeral: true
            });
            return;
          }

          const questUser = options.getUser('user');
          const questName = options.getString('quest');

          getQuest(questName, async (err, quest) => {
            if (err || !quest) {
              await interaction.reply({
                content: `❌ Quête **${questName}** introuvable.`,
                ephemeral: true
              });
              return;
            }

            completeQuest(questUser.id, questName, async (err) => {
              if (err) {
                await interaction.reply({
                  content: `❌ Erreur lors de la validation: ${err.message}`,
                  ephemeral: true
                });
                return;
              }

              // Send notification to staff channel
              const staffChannel = await getStaffChannel(guild);
              if (staffChannel) {
                const embed = new EmbedBuilder()
                  .setTitle('✅ Validation de quête')
                  .setDescription(`**${member.displayName}** a validé la quête **${questName}** pour **${questUser.tag}** !`)
                  .setColor('#00FF00')
                  .setFooter({ text: `Récompense: ${quest.reward} points` });

                const row = new ActionRowBuilder()
                  .addComponents(
                    new ButtonBuilder()
                      .setCustomId(`quest_${questName}_${questUser.id}`)
                      .setLabel('Confirmer')
                      .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                      .setCustomId(`reject_${questName}_${questUser.id}`)
                      .setLabel('Rejeter')
                      .setStyle(ButtonStyle.Danger)
                  );

                await staffChannel.send({ embeds: [embed], components: [row] });
              }

              await interaction.reply({
                content: `✅ Quête **${questName}** validée pour **${questUser.tag}** ! ${quest.reward} points ont été ajoutés.`,
                ephemeral: false
              });
            });
          });
        }
        break;

      case 'mystere':
        const mystereSubcommand = options.getSubcommand();

        if (mystereSubcommand === 'statut') {
          getMystere(async (err, row) => {
            if (err) {
              await interaction.reply({
                content: '❌ Erreur lors de la vérification du membre mystère.',
                ephemeral: true
              });
              return;
            }

            if (!row) {
              await interaction.reply({
                content: 'ℹ️ Aucun membre mystère n\'est actuellement défini.',
                ephemeral: false
              });
              return;
            }

            const mystereUser = await guild.members.fetch(row.user_id);
            const embed = new EmbedBuilder()
              .setTitle('🕵️‍♂️ Membre Mystère')
              .setDescription(`Un membre mystère est actuellement actif !\n**Récompense:** 5 points pour celui qui le découvre.`)
              .setColor('#FF00FF');

            // For staff, show the user
            if (isStaff(member)) {
              embed.addFields({
                name: 'Membre Mystère',
                value: `<@${row.user_id}>`,
                inline: true
              });
            }

            await interaction.reply({ embeds: [embed], ephemeral: false });
          });
        }

        else if (mystereSubcommand === 'set') {
          if (!isStaff(member)) {
            await interaction.reply({
              content: '❌ Vous n\'avez pas la permission d\'utiliser cette commande.',
              ephemeral: true
            });
            return;
          }

          const mystereUser = options.getUser('user');
          setMystere(mystereUser.id, async (err) => {
            if (err) {
              await interaction.reply({
                content: `❌ Erreur: ${err.message}`,
                ephemeral: true
              });
              return;
            }
            await interaction.reply({
              content: `✅ **${mystereUser.tag}** a été défini comme membre mystère !`,
              ephemeral: false
            });
          });
        }

        else if (mystereSubcommand === 'reveal') {
          if (!isStaff(member)) {
            await interaction.reply({
              content: '❌ Vous n\'avez pas la permission d\'utiliser cette commande.',
              ephemeral: true
            });
            return;
          }

          getMystere(async (err, row) => {
            if (err || !row) {
              await interaction.reply({
                content: '❌ Aucun membre mystère à révéler.',
                ephemeral: true
              });
              return;
            }

            const mystereUser = await guild.members.fetch(row.user_id);
            revealMystere(async (err) => {
              if (err) {
                await interaction.reply({
                  content: `❌ Erreur: ${err.message}`,
                  ephemeral: true
                });
                return;
              }

              const embed = new EmbedBuilder()
                .setTitle('🎉 Révélation du Membre Mystère !')
                .setDescription(`Le membre mystère était... **${mystereUser.tag}** !`)
                .setColor('#FFD700');

              await interaction.reply({ embeds: [embed], ephemeral: false });
            });
          });
        }
        break;

      case 'rumor':
        const rumorSubcommand = options.getSubcommand();

        if (rumorSubcommand === 'add') {
          if (!isStaff(member)) {
            await interaction.reply({
              content: '❌ Vous n\'avez pas la permission d\'utiliser cette commande.',
              ephemeral: true
            });
            return;
          }

          const content = options.getString('content');
          addRumor(content, async (err) => {
            if (err) {
              await interaction.reply({
                content: `❌ Erreur: ${err.message}`,
                ephemeral: true
              });
              return;
            }
            await interaction.reply({
              content: '✅ Rumeur ajoutée avec succès !',
              ephemeral: false
            });
          });
        }

        else if (rumorSubcommand === 'list') {
          const status = options.getString('status') || 'pending';
          getRumorsByStatus(status, async (err, rows) => {
            if (err) {
              await interaction.reply({
                content: '❌ Erreur lors de la récupération des rumeurs.',
                ephemeral: true
              });
              return;
            }

            if (!rows || rows.length === 0) {
              await interaction.reply({
                content: `ℹ️ Aucune rumeur avec le statut **${status}**.`,
                ephemeral: false
              });
              return;
            }

            const rumorsText = rows.map(r => `**${r.id}.** ${r.content}`).join('\n\n');
            const embed = new EmbedBuilder()
              .setTitle(`🗣️ Rumeurs (${status})`)
              .setDescription(rumorsText)
              .setColor('#FF00FF');

            await interaction.reply({ embeds: [embed], ephemeral: false });
          });
        }
        break;

      case 'config':
        const configSubcommand = options.getSubcommand();

        if (configSubcommand === 'set') {
          if (!isStaff(member)) {
            await interaction.reply({
              content: '❌ Vous n\'avez pas la permission d\'utiliser cette commande.',
              ephemeral: true
            });
            return;
          }

          const key = options.getString('key');
          const value = options.getString('value');

          setConfig(key, value, async (err) => {
            if (err) {
              await interaction.reply({
                content: `❌ Erreur: ${err.message}`,
                ephemeral: true
              });
              return;
            }
            await interaction.reply({
              content: `✅ Configuration **${key}** définie sur **${value}**.`,
              ephemeral: false
            });
          });
        }

        else if (configSubcommand === 'get') {
          const key = options.getString('key');
          getConfig(key, async (err, value) => {
            if (err) {
              await interaction.reply({
                content: `❌ Erreur: ${err.message}`,
                ephemeral: true
              });
              return;
            }

            if (!value) {
              await interaction.reply({
                content: `ℹ️ Aucune valeur définie pour **${key}**.`,
                ephemeral: false
              });
              return;
            }

            await interaction.reply({
              content: `**${key}**: ${value}`,
              ephemeral: false
            });
          });
        }
        break;
    }
  } catch (error) {
    console.error('Error handling command:', error);
    await interaction.reply({
      content: `❌ Une erreur est survenue: ${error.message}`,
      ephemeral: true
    });
  }
});

// Handle button interactions for quest validation
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const { customId, guild, member } = interaction;

  if (customId.startsWith('quest_')) {
    if (!isStaff(member)) {
      await interaction.reply({
        content: '❌ Vous n\'avez pas la permission de valider cette quête.',
        ephemeral: true
      });
      return;
    }

    const parts = customId.split('_');
    const questName = parts.slice(1, -1).join('_');
    const userId = parts[parts.length - 1];

    if (customId.startsWith('quest_') && !customId.includes('reject')) {
      getQuest(questName, async (err, quest) => {
        if (err || !quest) {
          await interaction.reply({
            content: '❌ Quête introuvable.',
            ephemeral: true
          });
          return;
        }

        completeQuest(userId, questName, async (err) => {
          if (err) {
            await interaction.reply({
              content: `❌ Erreur: ${err.message}`,
              ephemeral: true
            });
            return;
          }

          const user = await guild.members.fetch(userId);
          await interaction.reply({
            content: `✅ Quête **${questName}** confirmée pour **${user.tag}** ! ${quest.reward} points ajoutés.`,
            ephemeral: false
          });
        });
      });
    }

    else if (customId.includes('reject')) {
      await interaction.reply({
        content: '❌ Quête rejetée.',
        ephemeral: false
      });
    }
  }
});

// Login
client.login(token);

// Handle process termination
process.on('SIGINT', () => {
  db.close();
  client.destroy();
  process.exit();
});
