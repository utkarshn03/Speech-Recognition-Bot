const { Readable } = require('stream')

const Discord = require('discord.js')

const ytdl = require('ytdl-core')
const ytsr = require('ytsr')

const { prefix, token } = require('./config')
const { processAudio } = require('./audio-processing-setup')


// Noiseless stream of audio to send when the bot joins a voice channel
class Silence extends Readable {
  _read() {
    this.push(Buffer.from([0xF8, 0xFF, 0xFE]))
  }
}

async function handleVoiceCommands(command, connection, ctx) {
  console.log(command.queryText + ' -> ' + command.action)
  async function playQueue() {
    let server = servers[ctx.guild.id]
    
    server.dispatcher = connection.play(ytdl(server.queue[0], { filter: 'audioonly' }))

    server.dispatcher.on('finish', function () {
      server.queue.shift()

      if (server.queue[0]) {
        setTimeout(playQueue, 3000)
      }
    })
  }

  async function addToQueue() {
    if (!servers[ctx.guild.id]) servers[ctx.guild.id] = { queue: [] }
    let server = servers[ctx.guild.id]

    if (server.search) {
      options = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4,
                  'one': 0, 'two': 1, 'three': 2, 'four': 3, 'five': 4 }

      for (option in options) {
        if (command.queryText.includes(option)) {
          server.queue.push(server.search[options[option]].link)
          delete server.search
        }
      }

      return
    }
    
    let search = command.queryText.split(' ').slice(2).join(' ')
    let url = await ytsr(search, { limit: 1 })
    
    server.queue.push(url.items[0].link)
  }

  async function makeSearch() {
    if (!servers[ctx.guild.id]) servers[ctx.guild.id] = { queue: [] }
    let server = servers[ctx.guild.id]

    let search = command.queryText.split(' ').slice(2).join(' ')
    let url = await ytsr(search, { limit: 5 })
    
    server.search = url.items
    
    let titles = ''

    for (index in url.items) {
      titles += `**${parseInt(index)+1}.** ${url.items[index].title}\n`
    }

    const embededMessage = new Discord.MessageEmbed()
      .setColor('#ffbc1f')
      .setTitle('**SEARCH RESULTS**')
      .setDescription(titles)

    await ctx.channel.send(embededMessage)
  }

  let server = servers[ctx.guild.id]

  // I had to use synonyms for some actions because
  // Dialogflow couldn't understand them clearly
  switch (command.action) {
    case 'Play':
      await addToQueue()
      await playQueue()
      break
    
    case 'Include':
      await addToQueue()
      ctx.channel.send('Queueing..')
      break
    
    case 'Search':
      await makeSearch()
      break

    case 'Stop':
      server.queue = []
      server.dispatcher.destroy()
      ctx.channel.send('Stopping..')
      break
    
    case 'Pause':
      if (!server.dispatcher.paused) server.dispatcher.pause()
      break
    
    case 'Resume':
      // Not working yet (for some reason)
      if (server.dispatcher.paused) server.dispatcher.resume()

    case 'Skip':
      if (server.dispatcher) {
        server.dispatcher.end()
        ctx.channel.send('Skipping..')
      }
      break

    default:
      break
  }
}

const client = new Discord.Client()

// To store queues
servers = {}

client.on('ready', () => {
  console.log(`Up and running.`)
})

client.on('message', async ctx => {
  if (!ctx.content.startsWith(prefix)) return

  const command = ctx.content.slice(prefix.length)

  switch (command) {
    case 'join':
      if (ctx.member.voice.channel) {
        const connection = await ctx.member.voice.channel.join()
        connection.play(new Silence(), { type: 'opus' })
        ctx.channel.send('I\'m listening.. My hotword is **bumblebee**.')

        connection.on('speaking', async (user, speaking) => {
          if (speaking.has('SPEAKING')) {
            let audioStream = connection.receiver.createStream(user, { mode: 'pcm' })
            let result = await processAudio(audioStream)

            if (result) {
              handleVoiceCommands(result, connection, ctx)
            }
          }
        })
      }
      break

    case 'leave':
      try { ctx.guild.voice.channel.leave() } catch {}
      break

    default:
      break
  }
})


client.login(token)
