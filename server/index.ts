import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import Database from 'better-sqlite3'
import { randomBytes } from 'node:crypto'

type DraftSettings = { teams: number; rosterSize: number; snake: boolean }
type Room = DraftSettings & { code: string; picks: PickRecord[]; players: Player[] }
type Player = { id: number; name: string; team: string; position: string; rank: number; projection: number }
type PickRecord = { pick: number; team: number; playerId: number; playerName: string; owner: string }

const players: Player[] = [
  ['Nikola Jokic', 'DEN', 'C', 1, 62.4], ['Shai Gilgeous-Alexander', 'OKC', 'G', 2, 59.8],
  ['Luka Doncic', 'LAL', 'G', 3, 58.9], ['Giannis Antetokounmpo', 'MIL', 'F', 4, 58.1],
  ['Jayson Tatum', 'BOS', 'F', 5, 54.7], ['Anthony Davis', 'LAL', 'F/C', 6, 53.8],
  ['Victor Wembanyama', 'SAS', 'C', 7, 52.9], ['Joel Embiid', 'PHI', 'C', 8, 52.4],
  ['Tyrese Haliburton', 'IND', 'G', 9, 49.8], ['Anthony Edwards', 'MIN', 'G', 10, 49.2],
  ['Domantas Sabonis', 'SAC', 'C', 11, 48.7], ['Kevin Durant', 'PHX', 'F', 12, 48.1],
  ['Stephen Curry', 'GSW', 'G', 13, 47.8], ['Donovan Mitchell', 'CLE', 'G', 14, 46.9],
  ['Devin Booker', 'PHX', 'G', 15, 46.5], ['Jaylen Brown', 'BOS', 'F', 16, 45.4],
  ['Trae Young', 'ATL', 'G', 17, 44.9], ['Bam Adebayo', 'MIA', 'C', 18, 44.1]
].map(([name, team, position, rank, projection], index) => ({ id: index + 1, name: name as string, team: team as string, position: position as string, rank: rank as number, projection: projection as number }))

const db = new Database('draftroom.sqlite')
db.exec('CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, teams INTEGER NOT NULL, roster_size INTEGER NOT NULL, snake INTEGER NOT NULL, created_at TEXT NOT NULL)')
db.exec('CREATE TABLE IF NOT EXISTS picks (room_code TEXT NOT NULL, pick_number INTEGER NOT NULL, team_number INTEGER NOT NULL, player_id INTEGER NOT NULL, player_name TEXT NOT NULL, owner TEXT NOT NULL, PRIMARY KEY (room_code, pick_number))')

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })
const rooms = new Map<string, Room>()

function roomFromDb(code: string): Room | undefined {
  const row = db.prepare('SELECT * FROM rooms WHERE code = ?').get(code) as { code: string; teams: number; roster_size: number; snake: number } | undefined
  if (!row) return undefined
  const picks = db.prepare('SELECT pick_number as pick, team_number as team, player_id as playerId, player_name as playerName, owner FROM picks WHERE room_code = ? ORDER BY pick_number').all(code) as PickRecord[]
  return { code, teams: row.teams, rosterSize: row.roster_size, snake: Boolean(row.snake), picks, players }
}

function savePick(room: Room, pick: PickRecord) {
  db.prepare('INSERT INTO picks (room_code, pick_number, team_number, player_id, player_name, owner) VALUES (?, ?, ?, ?, ?, ?)').run(room.code, pick.pick, pick.team, pick.playerId, pick.playerName, pick.owner)
}

function publicRoom(room: Room) { return { ...room, availablePlayers: room.players.filter(p => !room.picks.some(x => x.playerId === p.id)) } }

io.on('connection', socket => {
  socket.on('create-room', (settings: DraftSettings, callback: (room: Room) => void) => {
    const code = randomBytes(3).toString('hex').toUpperCase()
    const room = { code, ...settings, picks: [], players }
    rooms.set(code, room)
    db.prepare('INSERT INTO rooms (code, teams, roster_size, snake, created_at) VALUES (?, ?, ?, ?, ?)').run(code, settings.teams, settings.rosterSize, settings.snake ? 1 : 0, new Date().toISOString())
    socket.join(code)
    callback(publicRoom(room))
  })

  socket.on('join-room', (code: string, callback: (room: Room | { error: string }) => void) => {
    const normalized = code.trim().toUpperCase()
    const room = rooms.get(normalized) ?? roomFromDb(normalized)
    if (!room) return callback({ error: 'Room not found. Check the code and try again.' })
    rooms.set(normalized, room)
    socket.join(normalized)
    callback(publicRoom(room))
  })

  socket.on('make-pick', ({ code, playerId, owner }: { code: string; playerId: number; owner: string }, callback: (result: { ok: boolean; error?: string }) => void) => {
    const room = rooms.get(code)
    if (!room) return callback({ ok: false, error: 'Room is no longer active.' })
    const totalPicks = room.teams * room.rosterSize
    if (room.picks.length >= totalPicks) return callback({ ok: false, error: 'The draft is complete.' })
    if (room.picks.some(p => p.playerId === playerId)) return callback({ ok: false, error: 'That player has already been drafted.' })
    const round = Math.floor(room.picks.length / room.teams)
    const position = room.picks.length % room.teams
    const team = room.snake && round % 2 === 1 ? room.teams - position : position + 1
    const player = room.players.find(p => p.id === playerId)
    if (!player) return callback({ ok: false, error: 'Player not found.' })
    const pick = { pick: room.picks.length + 1, team, playerId, playerName: player.name, owner }
    room.picks.push(pick)
    savePick(room, pick)
    io.to(code).emit('room-updated', publicRoom(room))
    callback({ ok: true })
  })
})

app.get('/health', (_req, res) => res.json({ ok: true }))
httpServer.listen(3001, () => console.log('Draftroom server listening on http://localhost:3001'))
