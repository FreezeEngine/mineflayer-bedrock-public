const { Vec3 } = require('vec3')
const assert = require('assert')
const { onceWithCleanup } = require('../promise_utils')
const fs = require('fs')

const { BlobEntry, BlobType } = require('prismarine-chunk')
const BlobStore = require('../BlobStore')

const { OctahedronIterator } = require('prismarine-world/src/iterators')

module.exports = inject
const serialize = obj => JSON.stringify(obj, (k, v) => typeof v?.valueOf?.() === 'bigint' ? v.toString() : v)

const dimensionNames = {
  '-1': 'minecraft:nether',
  0: 'minecraft:overworld',
  1: 'minecraft:end'
}

function inject (bot, { version, storageBuilder, hideErrors }) {
  // const registry = bot._client.host !== 'mco.cubecraft.net' ? bot.registry : require('prismarine-registry')('bedrock_1.18.30')
  const Block = require('prismarine-block')(bot.registry)
  const Chunk = require('prismarine-chunk')(bot.registry) // bot.registry ChunkColumn bot.registry
  const World = require('prismarine-world')(bot.registry)
  const blobStore = new BlobStore()

  function delColumn (chunkX, chunkZ) {
    bot.world.unloadColumn(chunkX, chunkZ)
  }
  // load chunk into a column
  function addColumn (args) {
    try {
      bot.world.setColumn(args.x, args.z, args.column)
    } catch (e) {
      bot.emit('error', e)
    }
  }

  async function waitForChunksToLoad () {
    const dist = 4
    // This makes sure that the bot's real position has been already sent
    if (!bot.entity.height) await onceWithCleanup(bot, 'chunkColumnLoad')
    const pos = bot.entity.position
    const center = new Vec3(pos.x >> 4 << 4, 0, pos.z >> 4 << 4)
    // get corner coords of 5x5 chunks around us
    const chunkPosToCheck = new Set()
    for (let x = -dist; x <= dist; x++) {
      for (let y = -dist; y <= dist; y++) {
        // ignore any chunks which are already loaded
        const pos = center.plus(new Vec3(x, 0, y).scaled(16))
        if (!bot.world.getColumnAt(pos)) chunkPosToCheck.add(pos.toString())
      }
    }

    if (chunkPosToCheck.size) {
      return new Promise((resolve) => {
        function waitForLoadEvents (columnCorner) {
          chunkPosToCheck.delete(columnCorner.toString())
          if (chunkPosToCheck.size === 0) { // no chunks left to find
            bot.world.off('chunkColumnLoad', waitForLoadEvents) // remove this listener instance
            resolve()
          }
        }

        // begin listening for remaining chunks to load
        bot.world.on('chunkColumnLoad', waitForLoadEvents)
      })
    }
  }

  bot._client.on('join', () => {
    bot._client.queue('client_cache_status', { enabled: cachingEnabled })
  })

  // this would go in pworld
  let subChunkMissHashes = []
  let sentMiss = false
  let gotMiss = false
  let lostSubChunks = 0, foundSubChunks = 0

  const cachingEnabled = false;

  //console.log(version, 'Lost number of invalid subchunks was', lostSubChunks, ', and found', foundSubChunks, 'with caching', cachingEnabled)

  //let points = []
  async function processLevelChunk(packet) {
    const cc = new Chunk({ x: packet.x, z: packet.z })
    if (!cachingEnabled) {
      await cc.networkDecodeNoCache(packet.payload, packet.sub_chunk_count)
    } else if (cachingEnabled) {
      const misses = await cc.networkDecode(packet.blobs.hashes, blobStore, packet.payload)
      if (!packet.blobs.hashes.length) return // no blobs

      bot._client.queue('client_cache_blob_status', {
        misses: misses.length,
        haves: 0,
        have: [],
        missing: missesa
      })

      if (packet.sub_chunk_count < 0) { // 1.18+
        for (const miss of misses) blobStore.addPending(miss, new BlobEntry({ type: BlobType.Biomes, x: packet.x, z: packet.z }))
      } else { // 1.17-
        const lastBlob = packet.blobs.hashes[packet.blobs.hashes.length - 1]
        for (const miss of misses) {
          blobStore.addPending(miss, new BlobEntry({ type: miss === lastBlob ? BlobType.Biomes : BlobType.ChunkSection, x: packet.x, z: packet.z }))
        }
        sentMiss = true
      }

      blobStore.once(misses, async () => {
        // The things we were missing have now arrived
        const now = await cc.networkDecode(packet.blobs.hashes, blobStore, packet.payload)
        fs.writeFileSync(
          `fixtures/${version}/level_chunk CacheMissResponse ${packet.x},${packet.z}.json`,
          serialize({ blobs: Object.fromEntries(packet.blobs.hashes.map(h => [h.toString(), blobStore.get(h).buffer])) })
        )
        assert.strictEqual(now.length, 0)

        bot._client.queue('client_cache_blob_status', {
          misses: 0,
          haves: packet.blobs.hashes.length,
          have: packet.blobs.hashes,
          missing: []
        })

        gotMiss = true
      })
    }

    if (packet.sub_chunk_count < 0) { // 1.18.0+
      // 1.18+ handling, we need to send a SubChunk request
      const maxSubChunkCount = packet.sub_chunk_count || 5 // field is set if sub_chunk_count=-2 (1.18.10+) meaning all air

      function getChunkCoordinates(pos) {
        let chunkX = Math.floor(pos.x / 16);
        let chunkZ = Math.floor(pos.z / 16);
        let subchunkY = Math.floor(pos.y / 16);
        return { chunkX: chunkX, chunkZ: chunkZ, subchunkY: subchunkY };
      }

      if (bot.registry.version['>=']('1.18.11')) {
        // We can send the request in one big load!
        // let origin = getChunkCoordinates(bot.entity.position)
        // let x = packet.x <= 0 ? 255 + packet.x : packet.x
        // let z = packet.z <= 0 ? 255 + packet.z : packet.z

        let requests = []

        // CALCULATE OFFSET BASED ON MIN HEIGHT OF A CHUNK
        let offset = -4//packet.highest_subchunk_count < 0 ? 4 : 0 // -128 to 127
        // load all height of the chunk
        for (let i = offset; i < maxSubChunkCount; i++) requests.push({ dx: 0, dz: 0, dy: i}) //Buffer.from([i]).readUint8(0)
        // console.log(requests)
        // console.log(packet)
        // console.log({ origin: { x: origin.chunkX, z: origin.chunkZ, y: 0 }})
        //console.log(origin.subchunkY)
        if(requests.length > 0) {
          bot._client.queue('subchunk_request', { origin: { x: packet.x, z: packet.z, y: 0 }, requests, dimension: 0 })
        }
        //console.log(requests)
      } else if (bot.registry.version['>=']('1.18')) {
        for (let i = 1; i < maxSubChunkCount; i++) { // Math.min(maxSubChunkCount, 5)
          bot._client.queue('subchunk_request', { x: packet.x, z: packet.z, y: 0, dimension: 0 })
        }
      }
    }

    addColumn({
      x:packet.x,
      z:packet.z,
      column: cc
    })
  }

  async function loadCached(cc, x, y, z, blobId, extraData) {
    const misses = await cc.networkDecodeSubChunk([blobId], blobStore, extraData)
    subChunkMissHashes.push(...misses)

    for (const miss of misses) {
      blobStore.addPending(miss, new BlobEntry({ type: BlobType.ChunkSection, x, z, y }))
    }

    if (subChunkMissHashes.length >= 10) {
      sentMiss = true
      const r = {
        misses: subChunkMissHashes.length,
        haves: 0,
        have: [],
        missing: subChunkMissHashes
      }

      bot._client.queue('client_cache_blob_status', r)
      subChunkMissHashes = []
    }

    if (misses.length) {
      const [missed] = misses
      // Once we get this blob, try again

      blobStore.once([missed], async () => {
        gotMiss = true
        fs.writeFileSync(
          `fixtures/${version}/subchunk CacheMissResponse ${x},${z},${y}.json`,
          serialize({ blobs: Object.fromEntries([[missed.toString(), blobStore.get(missed).buffer]]) })
        )
        // Call this again, ignore the payload since that's already been decoded
        const misses = await cc.networkDecodeSubChunk([missed], blobStore)
        assert(!misses.length, 'Should not have missed anything')
      })
    }
  }

  async function processSubChunk(packet) {
    if (packet.entries) { // 1.18.10+ handling
      for (const entry of packet.entries) {



        const x = packet.origin.x + entry.dx
        const y = packet.origin.y + Buffer.from([entry.dy]).readInt8(0)
        const z = packet.origin.z + entry.dz

        const cc = bot.world.getColumn(x,z)
        //console.log(x, y, z)

        // points.push([x, y, z])
        // bot.points = points
        //console.log(JSON.stringify(points))

        if (entry.result === 'success') {
          foundSubChunks++
          if (packet.cache_enabled) {
            await loadCached(cc, x, y, z, entry.blob_id, entry.payload)
          } else {
            try {
              await cc.networkDecodeSubChunkNoCache(y, entry.payload)
            }catch (e){
              //console.log(cc)
            }
            // let position = new Vec3(0, -62, 0)
            // let block_at15 = bot.world.getColumnAt(position).getBlock(position)
            // console.log(position)
            // console.log(block_at15)
          }
        } else {
          lostSubChunks++
        }
      }
    } else {
      if (packet.request_result !== 'success') {
        lostSubChunks++
        return
      }
      foundSubChunks++
      const cc = bot.world.getColumn(packet.x, packet.z)
      if (packet.cache_enabled) {
        await loadCached(cc, packet.x, packet.y, packet.z, packet.blob_id, packet.data)
      } else {
        await cc.networkDecodeSubChunkNoCache(packet.y, packet.data)
      }
    }
  }

  async function processCacheMiss(packet) {
    const acks = []
    for (const { hash, payload } of packet.blobs) {
      const name = hash.toString()
      blobStore.updatePending(name, { buffer: payload })
      acks.push(hash)
    }

    // Send back an ACK
    bot._client.queue('client_cache_blob_status', {
      misses: 0,
      haves: acks.length,
      have: [],
      missing: acks
    })
  }

  bot._client.on('level_chunk', processLevelChunk)
  bot._client.on('subchunk', (sc) => processSubChunk(sc).catch(console.error))
  bot._client.on('client_cache_miss_response', processCacheMiss)

  // fs.mkdirSync(`fixtures/${version}/pchunk`, { recursive: true })
  // bot._client.on('packet', ({ data: { name, params }, fullBuffer }) => {
  //   if (name === 'level_chunk') {
  //     fs.writeFileSync(`fixtures/${version}/level_chunk ${cachingEnabled ? 'cached' : ''} ${params.x},${params.z}.json`, serialize(params))
  //   } else if (name === 'subchunk') {
  //     if (params.origin) {
  //       fs.writeFileSync(`fixtures/${version}/subchunk ${cachingEnabled ? 'cached' : ''} ${params.origin.x},${params.origin.z},${params.origin.y}.json`, serialize(params))
  //     } else {
  //       fs.writeFileSync(`fixtures/${version}/subchunk ${cachingEnabled ? 'cached' : ''} ${params.x},${params.z},${params.y}.json`, serialize(params))
  //     }
  //   }
  // })

  function getMatchingFunction (matching) {
    if (typeof (matching) !== 'function') {
      if (!Array.isArray(matching)) {
        matching = [matching]
      }
      return isMatchingType
    }
    return matching

    function isMatchingType (block) {
      return block === null ? false : matching.indexOf(block.type) >= 0
    }
  }

  function isBlockInSection (section, matcher) {
    if (!section) return false // section is empty, skip it (yay!)
    // If the chunk use a palette we can speed up the search by first
    // checking the palette which usually contains less than 20 ids
    // vs checking the 4096 block of the section. If we don't have a
    // match in the palette, we can skip this section.
    if (section.palette) {
      for (const stateId of section.palette) {
        if (matcher(Block.fromStateId(stateId, 0))) {
          return true // the block is in the palette
        }
      }
      return false // skip
    }
    return true // global palette, the block might be in there
  }

  function getFullMatchingFunction (matcher, useExtraInfo) {
    if (typeof (useExtraInfo) === 'boolean') {
      return fullSearchMatcher
    }

    return nonFullSearchMatcher

    function nonFullSearchMatcher (point) {
      const block = blockAt(point, true)
      return matcher(block) && useExtraInfo(block)
    }

    function fullSearchMatcher (point) {
      return matcher(bot.blockAt(point, useExtraInfo))
    }
  }

  bot.findBlocks = (options) => {
    const matcher = getMatchingFunction(options.matching)
    const point = (options.point || bot.entity.position).floored()
    const maxDistance = options.maxDistance || 16
    const count = options.count || 1
    const useExtraInfo = options.useExtraInfo || false
    const fullMatcher = getFullMatchingFunction(matcher, useExtraInfo)
    const start = new Vec3(Math.floor(point.x / 16), Math.floor(point.y / 16), Math.floor(point.z / 16))
    const it = new OctahedronIterator(start, Math.ceil((maxDistance + 8) / 16))
    // the octahedron iterator can sometime go through the same section again
    // we use a set to keep track of visited sections
    const visitedSections = new Set()

    let blocks = []
    let startedLayer = 0
    let next = start
    while (next) {
      const column = bot.world.getColumn(next.x, next.z)
      const sectionY = next.y + Math.abs(bot.game.minY >> 4)
      const totalSections = bot.game.height >> 4
      if (sectionY >= 0 && sectionY < totalSections && column && !visitedSections.has(next.toString())) {
        const section = column.sections[sectionY]
        if (useExtraInfo === true || isBlockInSection(section, matcher)) {
          const begin = new Vec3(next.x * 16, sectionY * 16 + bot.game.minY, next.z * 16)
          const cursor = begin.clone()
          const end = cursor.offset(16, 16, 16)
          for (cursor.x = begin.x; cursor.x < end.x; cursor.x++) {
            for (cursor.y = begin.y; cursor.y < end.y; cursor.y++) {
              for (cursor.z = begin.z; cursor.z < end.z; cursor.z++) {
                if (fullMatcher(cursor) && cursor.distanceTo(point) <= maxDistance) blocks.push(cursor.clone())
              }
            }
          }
        }
        visitedSections.add(next.toString())
      }
      // If we started a layer, we have to finish it otherwise we might miss closer blocks
      if (startedLayer !== it.apothem && blocks.length >= count) {
        break
      }
      startedLayer = it.apothem
      next = it.next()
    }
    blocks.sort((a, b) => {
      return a.distanceTo(point) - b.distanceTo(point)
    })
    // We found more blocks than needed, shorten the array to not confuse people
    if (blocks.length > count) {
      blocks = blocks.slice(0, count)
    }
    return blocks
  }

  function findBlock (options) {
    const blocks = bot.findBlocks(options)
    if (blocks.length === 0) return null
    return bot.blockAt(blocks[0])
  }

  function blockAt (absolutePoint, extraInfos = true) {
    const block = bot.world.getBlock(absolutePoint)
    // null block means chunk not loaded
    if (!block) return null

    return block
  }

  // if passed in block is within line of sight to the bot, returns true
  // also works on anything with a position value
  function canSeeBlock (block) {
    const headPos = bot.entity.position.offset(0, bot.entity.height, 0)
    const range = headPos.distanceTo(block.position)
    const dir = block.position.offset(0.5, 0.5, 0.5).minus(headPos)
    const match = (inputBlock, iter) => {
      const intersect = iter.intersect(inputBlock.shapes, inputBlock.position)
      if (intersect) { return true }
      return block.position.equals(inputBlock.position)
    }
    const blockAtCursor = bot.world.raycast(headPos, dir.normalize(), range, match)
    return blockAtCursor && blockAtCursor.position.equals(block.position)
  }

  function updateBlockState (point, stateId) {
    // const oldBlock = blockAt(point)
    bot.world.setBlockStateId(point, stateId)

    // const newBlock = blockAt(point)
    // // sometimes minecraft server sends us block updates before it sends
    // // us the column that the block is in. ignore this.
    // if (newBlock === null) {
    //   return
    // }
    // DELETE PAINTINGS
  }

  // bot._client.on('map_chunk', (packet) => {
  //   addColumn({
  //     x: packet.x,
  //     z: packet.z,
  //     bitMap: packet.bitMap,
  //     heightmaps: packet.heightmaps,
  //     biomes: packet.biomes,
  //     skyLightSent: bot.game.dimension === 'minecraft:overworld',
  //     groundUp: packet.groundUp,
  //     data: packet.chunkData,
  //     trustEdges: packet.trustEdges,
  //     skyLightMask: packet.skyLightMask,
  //     blockLightMask: packet.blockLightMask,
  //     emptySkyLightMask: packet.emptySkyLightMask,
  //     emptyBlockLightMask: packet.emptyBlockLightMask,
  //     skyLight: packet.skyLight,
  //     blockLight: packet.blockLight
  //   })
  //
  //   if (typeof packet.blockEntities !== 'undefined') {
  //     const column = bot.world.getColumn(packet.x, packet.z)
  //     if (!column) {
  //       if (!hideErrors) console.warn('Ignoring block entities as chunk failed to load at', packet.x, packet.z)
  //       return
  //     }
  //     for (const blockEntity of packet.blockEntities) {
  //       if (blockEntity.x !== undefined) { // 1.17+
  //         column.setBlockEntity(blockEntity, blockEntity.nbtData)
  //       } else {
  //         const pos = new Vec3(blockEntity.value.x.value & 0xf, blockEntity.value.y.value, blockEntity.value.z.value & 0xf)
  //         column.setBlockEntity(pos, blockEntity)
  //       }
  //     }
  //   }
  // })

  // bot._client.on('map_chunk_bulk', (packet) => {
  //   let offset = 0
  //   let meta
  //   let i
  //   let size
  //   for (i = 0; i < packet.meta.length; ++i) {
  //     meta = packet.meta[i]
  //     size = (8192 + (packet.skyLightSent ? 2048 : 0)) *
  //       onesInShort(meta.bitMap) + // block ids
  //       2048 * onesInShort(meta.bitMap) + // (two bytes per block id)
  //       256 // biomes
  //     addColumn({
  //       x: meta.x,
  //       z: meta.z,
  //       bitMap: meta.bitMap,
  //       heightmaps: packet.heightmaps,
  //       skyLightSent: packet.skyLightSent,
  //       groundUp: true,
  //       data: packet.data.slice(offset, offset + size)
  //     })
  //     offset += size
  //   }
  //
  //   assert.strictEqual(offset, packet.data.length)
  // })

  bot._client.on('update_subchunk_blocks', (packet) => { // Packet Update Subchunk Blocks
    // multi block change
    // EXTRA NOT IMPLEMENTED (WATERLOGGED)
    for (let i = 0; i < packet.blocks.length; i++) {
      const record = packet.blocks[i]
      const pt = new Vec3(record.position.x, record.position.y, record.position.z)
      updateBlockState(pt, record.runtime_id)
    }
  })

  bot._client.on('update_block', (packet) => {
    const pt = new Vec3(packet.position.x, packet.position.y, packet.position.z)
    updateBlockState(pt, packet.block_runtime_id)
  })


  // bot._client.on('explosion', (packet) => {
  //   // explosion
  //   const p = new Vec3(packet.x, packet.y, packet.z)
  //   packet.affectedBlockOffsets.forEach((offset) => {
  //     const pt = p.offset(offset.x, offset.y, offset.z)
  //     updateBlockState(pt, 0)
  //   })
  // }) // NO EXP PACKET ON BEDROCK


  // if we get a respawn packet and the dimension is changed,
  // unload all chunks from memory.
  let dimension
  let worldName
  function dimensionToFolderName (dimension) {
    if (bot.supportFeature('dimensionIsAnInt')) {
      return dimensionNames[dimension]
    } else if (bot.supportFeature('dimensionIsAString') || bot.supportFeature('dimensionIsAWorld')) {
      return dimension
    }
  }

  async function switchWorld () {
    if (bot.world) {
      if (storageBuilder) {
        await bot.world.async.waitSaving()
      }

      for (const [name, listener] of Object.entries(bot._events)) {
        if (name.startsWith('blockUpdate:')) {
          bot.emit(name, null, null)
          bot.off(name, listener)
        }
      }

      for (const [x, z] of Object.keys(bot.world.async.columns).map(key => key.split(',').map(x => parseInt(x, 10)))) {
        bot.world.unloadColumn(x, z)
      }

      if (storageBuilder) {
        bot.world.async.storageProvider = storageBuilder({ version: bot.version, worldName: dimensionToFolderName(dimension) })
      }
    } else {
      bot.world = new World(null, storageBuilder ? storageBuilder({ version: bot.version, worldName: dimensionToFolderName(dimension) }) : null).sync
      startListenerProxy()
    }
  }

  bot._client.on('start_game', (packet) => {
    if (bot.supportFeature('dimensionIsAnInt')) {
      dimension = packet.dimension
    } else {
      dimension = packet.dimension
      worldName = packet.world_name
    }
    switchWorld()
  })

  bot._client.on('respawn', (packet) => {
    if (bot.supportFeature('dimensionIsAnInt')) { // <=1.15.2
      if (dimension === packet.dimension) return
      dimension = packet.dimension
    } else { // >= 1.15.2
      if (dimension === packet.dimension) return
      if (worldName === packet.world_name && packet.copyMetadata === true) return // don't unload chunks if in same world and metaData is true
      // Metadata is true when switching dimensions however, then the world name is different packet.copyMetadata unavaliable for bedrock!!!
      dimension = packet.dimension
      worldName = packet.world_name
    }
    switchWorld()
  })

  let listener
  let listenerRemove
  function startListenerProxy () {
    if (listener) {
      // custom forwarder for custom events
      bot.off('newListener', listener)
      bot.off('removeListener', listenerRemove)
    }
    // standardized forwarding
    const forwardedEvents = ['blockUpdate', 'chunkColumnLoad', 'chunkColumnUnload']

    for (const event of forwardedEvents) {
      bot.world.on(event, (...args) => bot.emit(event, ...args))
    }
    const blockUpdateRegex = /blockUpdate:\(-?\d+, -?\d+, -?\d+\)/
    listener = (event, listener) => {
      if (blockUpdateRegex.test(event)) {
        bot.world.on(event, listener)
      }
    }
    listenerRemove = (event, listener) => {
      if (blockUpdateRegex.test(event)) {
        bot.world.off(event, listener)
      }
    }
    bot.on('newListener', listener)
    bot.on('removeListener', listenerRemove)
  }

  bot.findBlock = findBlock
  bot.canSeeBlock = canSeeBlock
  bot.blockAt = blockAt
  bot._updateBlockState = updateBlockState
  bot.waitForChunksToLoad = waitForChunksToLoad
}

// function onesInShort (n) {
//   n = n & 0xffff
//   let count = 0
//   for (let i = 0; i < 16; ++i) {
//     count = ((1 << i) & n) ? count + 1 : count
//   }
//   return count
// }
