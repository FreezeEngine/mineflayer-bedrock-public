const { EventEmitter } = require('events')
const pluginLoader = require('./plugin_loader')

const plugins = {
  bed: require('./plugins/bed'),
  title: require('./plugins/title'),
  block_actions: require('./plugins/block_actions'),
  blocks: require('./plugins/blocks'),
  book: require('./plugins/book'),
  boss_bar: require('./plugins/boss_bar'),
  breath: require('./plugins/breath'),
  chat: require('./plugins/chat'),
  chest: require('./plugins/chest'),
  command_block: require('./plugins/command_block'),
  craft: require('./plugins/craft'),
  creative: require('./plugins/creative'),
  digging: require('./plugins/digging'),
  enchantment_table: require('./plugins/enchantment_table'),
  entities: require('./plugins/entities'),
  experience: require('./plugins/experience'),
  explosion: require('./plugins/explosion'),
  fishing: require('./plugins/fishing'),
  furnace: require('./plugins/furnace'),
  game: require('./plugins/game'),
  health: require('./plugins/health'),
  inventory: require('./plugins/inventory'),
  kick: require('./plugins/kick'),
  physics: require('./plugins/physics'),
  place_block: require('./plugins/place_block'),
  rain: require('./plugins/rain'),
  ray_trace: require('./plugins/ray_trace'),
  resource_pack: require('./plugins/resource_pack'),
  scoreboard: require('./plugins/scoreboard'),
  team: require('./plugins/team'),
  settings: require('./plugins/settings'),
  simple_inventory: require('./plugins/simple_inventory'),
  sound: require('./plugins/sound'),
  spawn_point: require('./plugins/spawn_point'),
  tablist: require('./plugins/tablist'),
  time: require('./plugins/time'),
  villager: require('./plugins/villager'),
  anvil: require('./plugins/anvil'),
  place_entity: require('./plugins/place_entity'),
  generic_place: require('./plugins/generic_place'),
  particle: require('./plugins/particle')
}

const bedrockPlugins = {
  //bed: require('./bedrockPlugins/bed'), // 0% - 40% possible to implement
  title: require('./bedrockPlugins/title'), // 100%

  block_actions: require('./bedrockPlugins/block_actions'), // // 40% destroyStage unavalible for bedrock, calculates client-side, piston and noteblocks fix req
  blocks: require('./bedrockPlugins/blocks'), // 80% WIP WORLD LOADER (block entities etc) doors bbs calc wrong (wrong state calc?)

  //book: require('./bedrockPlugins/book'), // 0% - 70% req work with nbt
  boss_bar: require('./bedrockPlugins/bossbar'), // 0% - 80% possible 100%

  breath: require('./bedrockPlugins/breath'), // 100%
  chat: require('./bedrockPlugins/chat'), // 90% - might not support chat patterns

  //chest: require('./bedrockPlugins/chest'), // 0% req inventory
  //command_block: require('./bedrockPlugins/command_block'), // 0% req inventory
  //craft: require('./bedrockPlugins/craft'), // 40% req inventory + working bedrock recepies
  //creative: require('./bedrockPlugins/creative'), // 70% req inventory
  //digging: require('./bedrockPlugins/digging'), // 50% req client side break calc
  //enchantment_table: require('./bedrockPlugins/enchantment_table'), // 0% req inv

  entities: require('./bedrockPlugins/entities'), // 100% working? (no item entities) yaw and pitch conversion req fix (pviewer rotates player too fast)

  experience: require('./bedrockPlugins/experience'), // 100%
  // explosion: require('./bedrockPlugins/explosion'), // 0% - 90% req logical checks, tho maybe its calc by server?
  // fishing: require('./bedrockPlugins/fishing'), // 0% - 90% 100% possible should work
  // furnace: require('./bedrockPlugins/furnace'), // 0% req inv

  game: require('./bedrockPlugins/game'), // 70% - 100% | works, req impl other stuff
  health: require('./bedrockPlugins/health'), // 100%

  //inventory: require('./bedrockPlugins/inventory_minimal'), // placeholder way?

  inventory: require('./bedrockPlugins/inventory'), // possible to implement everything | includes a few item transactions | armor and off-hand not supported rn | req pitem support | req pwindow support or bedrock features
  kick: require('./bedrockPlugins/kick'), // 100% done

  physics: require('./bedrockPlugins/physics'), // req blocks_.js and minecraft-data update (for effects)

  //place_block: require('./bedrockPlugins/place_block'), // req player auth input logic
  rain: require('./bedrockPlugins/rain'), // 100%, might require small check

  ray_trace: plugins.ray_trace, // 100% unchanged? HeadYaw implement?

  resource_pack: require('./bedrockPlugins/resource_pack'), // 100%. not needed since bedrock does not support/handled at login by bedrock-protocol

  scoreboard: require('./bedrockPlugins/scoreboard'), // badly implemented 10% 0 functions

  team: require('./bedrockPlugins/team'), // 0% req investigation
  //settings: require('./bedrockPlugins/settings'), // 0% only SOME settings are exposed (better to only leave chunks)
  simple_inventory: require('./bedrockPlugins/simple_inventory'), // armor and off-hand not supported
  sound: require('./bedrockPlugins/sound'), // 100%
  spawn_point: require('./bedrockPlugins/spawn_point'), // 100%, might require small logical checking
  tablist: require('./bedrockPlugins/tablist'), // 0% bedrock does not have it but possible to make a conversion

  time: require('./bedrockPlugins/time'), // doesnt have AGE

  //villager: require('./bedrockPlugins/villager'), // 0% req inv
  //anvil: require('./bedrockPlugins/anvil'), // 0% req inv
  //place_entity: require('./bedrockPlugins/place_entity'), // 0% - 80% | 100% possible
  //generic_place: require('./bedrockPlugins/generic_place'), // 0% not sure why but possible

  particle: require('./bedrockPlugins/particle') // mostly works, tho needs to be unified a bit
}

const minecraftData = require('minecraft-data')

// TODO: how to export supported version if both supported?
const { testedVersions, latestSupportedVersion, oldestSupportedVersion } = require('./version')(false)

const BEDROCK_PREFIX = 'bedrock_'

module.exports = {
  createBot,
  Location: require('./location'),
  Painting: require('./painting'),
  ScoreBoard: require('./scoreboard'), // prob incompatable
  BossBar: require('./bossbar'), // prob incompatable
  Particle: require('./particle'), // prob incompatable
  latestSupportedVersion,
  testedVersions,
  supportFeature: (feature, version) => require('prismarine-registry')(version).supportFeature(feature)
}

function createBot (options = {}) {
  options.isBedrock = options.version.indexOf(BEDROCK_PREFIX) !== -1
  //options.username = options.username ?? 'Player'
  options.version = options.version.replace(BEDROCK_PREFIX, '') ?? false
  options.plugins = options.plugins ?? {}
  options.hideErrors = options.hideErrors ?? false
  options.logErrors = options.logErrors ?? true
  options.loadInternalPlugins = options.loadInternalPlugins ?? true
  options.client = options.client ?? null
  options.brand = options.brand ?? 'vanilla'
  options.fakeWorldPath = options.fakeWorldPath ?? null
  const bot = new EventEmitter()
  bot._client = options.client
  bot.end = (reason) => bot._client.end(reason)
  if (options.logErrors) {
    bot.on('error', err => {
      if (!options.hideErrors) {
        console.log(err)
      }
    })
  }
  pluginLoader(bot, options)
  let pluginsToLoad = options.isBedrock ? bedrockPlugins : plugins

  const internalPlugins = Object.keys(pluginsToLoad)
      .filter(key => {
        if (typeof options.plugins[key] === 'function') return false
        if (options.plugins[key] === false) return false
        return options.plugins[key] || options.loadInternalPlugins
      }).map(key => pluginsToLoad[key])
  const externalPlugins = Object.keys(options.plugins)
      .filter(key => {
        return typeof options.plugins[key] === 'function'
      }).map(key => options.plugins[key])
  bot.loadPlugins([...internalPlugins, ...externalPlugins])

  let protocol = options.isBedrock ? require('bedrock-protocol') : require('minecraft-protocol')

  bot._client = bot._client ?? protocol.createClient({ ...options })
  bot._client.on('connect', () => {
    bot.emit('connect')
  })
  bot._client.on('error', (err) => {
    bot.emit('error', err)
  })
  bot._client.on('end', (reason) => {
    bot.emit('end', reason)
  })
  if (!bot._client.wait_connect) next() // unknown purpose
  else bot._client.once('connect_allowed', next)
  function next () {
    const { testedVersions, latestSupportedVersion, oldestSupportedVersion } = require('./version')(options.isBedrock)
    const serverPingVersion = options.isBedrock ? BEDROCK_PREFIX + options.version : bot._client.version
    bot.registry = require('prismarine-registry')(serverPingVersion)
    if (!bot.registry?.version) throw new Error(`Server version '${serverPingVersion}' is not supported, no data for version`)

    const versionData = bot.registry.version
    if (versionData['>'](latestSupportedVersion)) {
      throw new Error(`Server version '${serverPingVersion}' is not supported. Latest supported version is '${latestSupportedVersion}'.`)
    } else if (versionData['<'](oldestSupportedVersion)) {
      throw new Error(`Server version '${serverPingVersion}' is not supported. Oldest supported version is '${oldestSupportedVersion}'.`)
    }

    bot.protocolVersion = versionData.version
    bot.majorVersion = versionData.majorVersion
    bot.version = options.isBedrock ? BEDROCK_PREFIX + versionData.minecraftVersion : versionData.minecraftVersion
    options.version = options.isBedrock ? BEDROCK_PREFIX + versionData.minecraftVersion : versionData.minecraftVersion
    bot.supportFeature = bot.registry.supportFeature
    setTimeout(() => bot.emit('inject_allowed'), 0)
  }
  return bot
}
