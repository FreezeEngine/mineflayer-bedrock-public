const { Vec3 } = require('vec3')
const assert = require('assert')
const math = require('../math')
const conv = require('../conversions')
const { performance } = require('perf_hooks')
const { createDoneTask, createTask } = require('../promise_utils')

const { Physics, PlayerState } = require('prismarine-physics')

module.exports = inject

const PI = Math.PI
const PI_2 = Math.PI * 2
const PHYSICS_INTERVAL_MS = 50
const PHYSICS_TIMESTEP = PHYSICS_INTERVAL_MS / 1000

function inject (bot, { physicsEnabled }) {
  // console.log(bot.blockAt(pos, false));
  const world = { getBlock: (pos) => {
    // if(bot.entity.position.y < 0) {
      //console.log(bot.blockAt(new Vec3(128, 68+63, 128), false));
    //}//console.log(bot.blockAt(new Vec3(0, -61, 0).offset(0, +64, 0), false))
    return bot.blockAt(pos, false)
  } }
  const physics = Physics(bot.registry, world)

  const positionUpdateSentEveryTick = true // depends on server settings, non-auth movement sends updates only when pos/rot changes

  bot.jumpQueued = false
  bot.jumpTicks = 0 // autojump cooldown

  const controlState = {
    forward: false,
    back: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
    sneak: false
  }
  let lastSentJumping = false
  let lastSentSprinting = false
  let lastSentSneaking = false
  let lastSentYaw = null
  let lastSentPitch = null
  let lastSentHeadYaw = null

  let doPhysicsTimer = null
  let lastPhysicsFrameTime = null
  let shouldUsePhysics = false
  bot.physicsEnabled = physicsEnabled ?? true

  let tick = 0n

  const lastSent = {
    pitch: 0,
    yaw: 0, // change
    position: new Vec3(0,0,0), // change
    move_vector: { x:0, z:0 }, // change
    head_yaw: 0, // change
    input_data: {
      ascend: false,
      descend: false,
      north_jump: false,
      jump_down: false,
      sprint_down: false,
      change_height: false,
      jumping: false,
      auto_jumping_in_water: false,
      sneaking: false,
      sneak_down: false,
      up: false,
      down: false,
      left: false,
      right: false,
      up_left: false,
      up_right: false,
      want_up: false,
      want_down: false,
      want_down_slow: false,
      want_up_slow: false,
      sprinting: false,
      ascend_block: false,
      descend_block: false,
      sneak_toggle_down: false,
      persist_sneak: false,
      start_sprinting: false,
      stop_sprinting: false,
      start_sneaking: false,
      stop_sneaking: false,
      start_swimming: false,
      stop_swimming: false,
      start_jumping: false,
      start_gliding: false,
      stop_gliding: false,
      item_interact: false,
      block_action: false,
      item_stack_request: false
    },
    input_mode: 'mouse',
    play_mode: 'screen',
    interact_rotation: {x:0, z:0},
    //gaze_direction: undefined,
    tick: tick,
    delta: new Vec3(0,0,0), // velocity change
    transaction: undefined,
    item_stack_request: undefined,
    block_action: undefined,
    analogue_move_vector: { x:0, z:0 }, // for versions (1.19.80) > 1.19.30
    camera_orientation: { x:0, y:0, z:0 },
    raw_move_vector: { x: 0, z:0 }
  }

  // This function should be executed each tick (every 0.05 seconds)
  // How it works: https://gafferongames.com/post/fix_your_timestep/
  let timeAccumulator = 0
  let subchunkContainingPlayer = null

  function getChunkCoordinates(pos) {
    let chunkX = Math.floor(pos.x / 16);
    let chunkZ = Math.floor(pos.z / 16);
    let subchunkY = Math.floor(pos.y / 16);
    return new Vec3(chunkX, subchunkY, chunkZ);
  }

  function doPhysics () {
  //console.log('PHYSICS ENGINE IS UP')
    const now = performance.now()
    const deltaSeconds = (now - lastPhysicsFrameTime) / 1000
    lastPhysicsFrameTime = now

    timeAccumulator += deltaSeconds

    while (timeAccumulator >= PHYSICS_TIMESTEP) {
      if (bot.physicsEnabled && shouldUsePhysics) {
        physics.simulatePlayer(new PlayerState(bot, controlState), world).apply(bot)
        let subchunkContainingPlayerNew = getChunkCoordinates(bot.entity.position)
        if(subchunkContainingPlayerNew!==subchunkContainingPlayer){
          subchunkContainingPlayer = subchunkContainingPlayerNew
          bot.emit('subchunkContainingPlayerChanged', subchunkContainingPlayerNew)
        }
        bot.emit('physicsTick')
        bot.emit('physicTick') // Deprecated, only exists to support old plugins. May be removed in the future
      }
      updatePosition(PHYSICS_TIMESTEP)
      timeAccumulator -= PHYSICS_TIMESTEP
    }
  }

  function cleanup () {
    clearInterval(doPhysicsTimer)
    doPhysicsTimer = null
  }

  let player_auth_input_transaction = {}
  let tasks_queue = []

  bot.sendPlayerAuthInputTransaction =  async function (params = {}, wait = true) {
    Object.assign(player_auth_input_transaction, params)

    //if (wait) return await once(bot, 'updatePlayerPosition')
    if (wait) await new Promise((resolve) => tasks_queue.push(resolve)) //Fix this, temp workaround for too many listeners

    return null
  }

  function updateTransactions() {
    if (player_auth_input_transaction?.transaction) {

      lastSent.input_data.item_interact = true
      packet.transaction = player_auth_input_transaction.transaction
      delete player_auth_input_transaction.transaction
    }else{
      lastSent.input_data.item_interact = false
      lastSent.transaction = undefined
    }

    if (player_auth_input_transaction?.block_action) {
      lastSent.input_data.block_action = true
      lastSent.block_action = player_auth_input_transaction.block_action
      delete player_auth_input_transaction.block_action
      //console.log('packet.block_action', packet.block_action)
    }else{
      lastSent.input_data.block_action = false
      lastSent.block_action = undefined
    }
    if (player_auth_input_transaction?.item_stack_request) {
      lastSent.input_data.item_stack_request = true
      lastSent.item_stack_request = player_auth_input_transaction.item_stack_request
      delete player_auth_input_transaction.item_stack_request
      //console.log('packet.block_action', packet.block_action)
    }else{
      lastSent.input_data.block_action = false
      lastSent.block_action = undefined
    }
    for (const resolve of tasks_queue) resolve()
    tasks_queue = []
  }

  function updateMoveVector(){
    let moveVector = { x:0, z:0 }
    let max_value = controlState.sneak ? 0.3 : 1

    if(controlState.forward)
    {
      moveVector.z += max_value;
    }
    if(controlState.back)
    {
      moveVector.z -= max_value;
    }
    if(controlState.left)
    {
      moveVector.x -= max_value;
    }
    if(controlState.right)
    {
      moveVector.x += max_value;
    }

    let magnitude = (moveVector.x ** 2 + moveVector.z ** 2) ** 0.5

    if (magnitude > 1) {
      moveVector.x /= magnitude
      moveVector.z /= magnitude
    }

    //console.log([moveVector,controlState])
  }

  function updateAuthoritativeMovementFlags() {
    lastSent.input_data.up = controlState.forward
    lastSent.input_data.down = controlState.back
    lastSent.input_data.right = controlState.right
    lastSent.input_data.left = controlState.left

    lastSent.input_data.up_right = controlState.forward && controlState.right
    lastSent.input_data.up_left = controlState.forward && controlState.left

    if(lastSent.input_data.start_jumping === controlState.jump){
      lastSent.input_data.start_jumping = false
    }
    if(controlState.jump!==lastSentJumping){
      lastSentJumping = controlState.jump
      lastSent.input_data.jumping = controlState.jump
      lastSent.input_data.want_up = controlState.jump
      lastSent.input_data.north_jump = controlState.jump
      lastSent.input_data.jump_down = controlState.jump
      lastSent.input_data.start_jumping = controlState.jump
    }
    if(controlState.sprint!==lastSentSprinting){
      lastSentSprinting = controlState.sprint
      lastSent.input_data.sprint_down = controlState.sprint
      lastSent.input_data.sprinting = controlState.sprint
      lastSent.input_data.stop_sprinting = !controlState.sprint
    }
    if(controlState.sneak!==lastSentSneaking){
      lastSentSneaking = controlState.sneak
      lastSent.input_data.sneak_down = controlState.sneak
      lastSent.input_data.sneaking = controlState.sneak
      lastSent.input_data.stop_sneaking = !controlState.sneak
    }
  }

  function sendMovementUpdate(position, yaw, pitch) {

    lastSent.tick = lastSent.tick + BigInt(1)

    // sends data, no logic
    const oldPos = new Vec3(lastSent.x, lastSent.y, lastSent.z)

    lastSent.delta  = bot.entity.velocity

    if(!(lastSent.delta.x === 0 && lastSent.delta.y === 0 && lastSent.delta.z === 0)) {
      // console.log('UPDATE' + position)
    }

    lastSent.position = new Vec3(position.x, position.y + bot.entity.height, position.z)

    lastSent.yaw = yaw
    lastSent.pitch = pitch
    lastSent.head_yaw = yaw

    updateTransactions();
    updateMoveVector()
    updateAuthoritativeMovementFlags()

    bot._client.write('player_auth_input', lastSent)
    bot.emit('move', oldPos)
  }

  function deltaYaw (yaw1, yaw2) {
    let dYaw = (yaw1 - yaw2) % PI_2
    if (dYaw < -PI) dYaw += PI_2
    else if (dYaw > PI) dYaw -= PI_2

    return dYaw
  }

  function updatePosition (dt) {
    // bot.isAlive = true // TODO: MOVE TO HEALTH
    // If you're dead, you're probably on the ground though ...
    if (!bot.isAlive) bot.entity.onGround = true

    // Increment the yaw in baby steps so that notchian clients (not the server) can keep up.
    const dYaw = deltaYaw(bot.entity.yaw, lastSentYaw)
    const dPitch = bot.entity.pitch - (lastSentPitch || 0)

    // Vanilla doesn't clamp yaw, so we don't want to do it either
    const maxDeltaYaw = dt * physics.yawSpeed
    const maxDeltaPitch = dt * physics.pitchSpeed

    lastSentYaw += math.clamp(-maxDeltaYaw, dYaw, maxDeltaYaw)
    lastSentPitch += math.clamp(-maxDeltaPitch, dPitch, maxDeltaPitch)

    const yaw = Math.fround(conv.toNotchianYaw(lastSentYaw))
    const pitch = Math.fround(conv.toNotchianPitch(lastSentPitch))
    const position = bot.entity.position

    if (!positionUpdateSentEveryTick) { // in case with non-auth movement
      // Only send a position update if necessary, select the appropriate packet
      const positionUpdated = lastSent.x !== position.x || lastSent.y !== position.y || lastSent.z !== position.z
      // bot.isAlive = true // GET IT TO THE BOT
      const lookUpdated = lastSent.yaw !== yaw || lastSent.pitch !== pitch

      if ((positionUpdated || lookUpdated) && bot.isAlive) {
        sendMovementUpdate(position, yaw, pitch)
      }
    } else {
      sendMovementUpdate(position, yaw, pitch)
    }
  }

  bot.physics = physics

  function getMetadataForFlag(flag, state) {
    let metadata =
    {
      "key": "flags",
      "type": "long",
      "value":{
        flag: state,
      }
    }

    if (bot.registry.version['>=']('1.19.1')) {
      metadata['properties'] = {
        ints: [ ],
        floats: [ ]
      }
    }
    return metadata
  }

  bot.setControlState = (control, state) => {
    assert.ok(control in controlState, `invalid control: ${control}`)
    assert.ok(typeof state === 'boolean', `invalid state: ${state}`)
    if (controlState[control] === state) return
    controlState[control] = state
    if (control === 'jump' && state) {
      bot.jumpQueued = true
    } else if (control === 'sprint') {
      // might be deprecated
      bot._client.write('set_entity_data',{
        runtime_entity_id: bot.entity.id,
        metadata: [getMetadataForFlag("sprinting", state)],
        tick: 0
      })
    } else if (control === 'sneak') {
      bot._client.write('set_entity_data',{
        runtime_entity_id: bot.entity.id,
          metadata: [getMetadataForFlag("sneaking", state)],
        tick: 0
      })
    }
  }

  bot.getControlState = (control) => {
    assert.ok(control in controlState, `invalid control: ${control}`)
    return controlState[control]
  }

  bot.clearControlStates = () => {
    for (const control in controlState) {
      bot.setControlState(control, false)
    }
  }

  bot.controlState = {}

  for (const control of Object.keys(controlState)) {
    Object.defineProperty(bot.controlState, control, {
      get () {
        return controlState[control]
      },
      set (state) {
        bot.setControlState(control, state)
        return state
      }
    })
  }

  let lookingTask = createDoneTask()

  bot.on('move', () => {
    if (!lookingTask.done && Math.abs(deltaYaw(bot.entity.yaw, lastSentYaw)) < 0.001) {
      lookingTask.finish()
    }
  })

  bot.look = async (yaw, pitch, headYaw, force) => {
    if (!lookingTask.done) {
      lookingTask.finish() // finish the previous one
    }
    lookingTask = createTask()

    if(!bot.entity.headYaw){ // needs a fix?
      bot.entity.headYaw = 0;
    }

    // this is done to bypass certain anticheat checks that detect the player's sensitivity
    // by calculating the gcd of how much they move the mouse each tick
    const sensitivity = conv.fromNotchianPitch(0.15) // this is equal to 100% sensitivity in vanilla
    const yawChange = Math.round((yaw - bot.entity.yaw) / sensitivity) * sensitivity

    const headYawChange = Math.round((headYaw - bot.entity.headYaw) / sensitivity) * sensitivity
    const pitchChange = Math.round((pitch - bot.entity.pitch) / sensitivity) * sensitivity

    if (yawChange === 0 && pitchChange === 0) {
      return
    }

    bot.entity.yaw += yawChange
    bot.entity.headYaw += headYawChange
    bot.entity.pitch += pitchChange

    if (force) {
      lastSentYaw = yaw
      lastSentPitch = pitch
      return
    }

    await lookingTask.promise
  }

  bot.lookAt = async (point, force) => {
    const delta = point.minus(bot.entity.position.offset(0, bot.entity.height, 0))
    const yaw = Math.atan2(-delta.x, -delta.z)
    const headYaw = Math.atan2(-delta.x, -delta.z)
    const groundDistance = Math.sqrt(delta.x * delta.x + delta.z * delta.z)
    const pitch = Math.atan2(delta.y, groundDistance)
    await bot.look(yaw, pitch, headYaw, force)
  }

  // player position and look (clientbound) server to client
  const setPosition = (packet) => {
    if(BigInt(packet.runtime_id ?? packet.runtime_entity_id) !== BigInt(bot.entity.id))
      return
    console.log('BOT MOVED')
    bot.entity.height = 1.62
    bot.entity.velocity.set(0, 0, 0)

    // If flag is set, then the corresponding value is relative, else it is absolute
    const pos = bot.entity.position
    const position = packet.player_position ?? packet.position
    const start_game_packet = !!packet.player_position
    pos.set(
        position.x,
        position.y + bot.entity.height,
        position.z
    )

    const newYaw = packet.yaw ?? packet.rotation.z
    const newPitch = packet.pitch ?? packet.rotation.x
    bot.entity.yaw = newYaw // conv.fromNotchianYaw(newYaw)
    bot.entity.pitch = newPitch // conv.fromNotchianPitch(newPitch)
    bot.entity.onGround = false // if pos delta Y == 0 -> on ground

    sendMovementUpdate(pos, newYaw, newPitch, bot.entity.onGround)

    shouldUsePhysics = true
    bot.entity.timeSinceOnGround = 0
    lastSentYaw = bot.entity.yaw
    if (start_game_packet)
      bot._client.once('spawn',async (packet)=>{
        shouldUsePhysics = true
        if (doPhysicsTimer === null) {
          await bot.waitForChunksToLoad()
          lastPhysicsFrameTime = performance.now()
          doPhysicsTimer = setInterval(doPhysics, PHYSICS_INTERVAL_MS)
        }
      })
    bot.emit('forcedMove')
  }

  bot._client.on('move_player', setPosition)
  bot._client.on('start_game', setPosition)

  bot.waitForTicks = async function (ticks) {
    if (ticks <= 0) return
    await new Promise(resolve => {
      const tickListener = () => {
        ticks--
        if (ticks === 0) {
          bot.removeListener('physicsTick', tickListener)
          resolve()
        }
      }
      bot.on('physicsTick', tickListener)
    })
  }

  //bot.on('mount', () => { shouldUsePhysics = false })
  bot.on('respawn', () => { shouldUsePhysics = false })

  bot.on('spawn', async () => {
    shouldUsePhysics = true
    if (doPhysicsTimer === null) {
      await bot.waitForChunksToLoad()
      lastPhysicsFrameTime = performance.now()
      doPhysicsTimer = setInterval(doPhysics, PHYSICS_INTERVAL_MS)
    }
  })

  bot.on('end', cleanup)
}
