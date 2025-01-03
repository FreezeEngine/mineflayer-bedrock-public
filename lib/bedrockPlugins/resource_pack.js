const assert = require('assert')
module.exports = inject

function inject (bot) {

  function acceptResourcePack () {
    assert(false, 'Not supported')
  }

  function denyResourcePack () {
    assert(false, 'Not supported')
  }

  bot.acceptResourcePack = acceptResourcePack
  bot.denyResourcePack = denyResourcePack
}
