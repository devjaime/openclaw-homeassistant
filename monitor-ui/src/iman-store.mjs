import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const HOME = process.env.HOME || '';
const DB_PATH = process.env.IMAN_DB_PATH || path.join(HOME, '.openclaw', 'iman-map.db');

let db = null;

const SEED_NODES = [
  ['agent-general', 'agent', 'Agente General', 'Orquestador local para tareas variadas', { model: 'minimax-portal/MiniMax-M2.7', tags: ['general', 'planificación', 'herramientas'] }],
  ['skill-find', 'skill', 'Find Skills', 'Descubre capacidades instalables para una tarea', { source: 'skills.sh', sourceUrl: 'https://www.skills.sh/', installRef: 'vercel-labs/skills', tags: ['skills', 'descubrimiento'] }],
  ['skill-react', 'skill', 'React Best Practices', 'Patrones de rendimiento y arquitectura React', { source: 'skills.sh', sourceUrl: 'https://www.skills.sh/', installRef: 'vercel-labs/agent-skills', tags: ['react', 'frontend', 'rendimiento'] }],
  ['skill-browser', 'skill', 'Browser Automation', 'Navegación, inspección y pruebas web', { source: 'skills.sh', sourceUrl: 'https://www.skills.sh/', tags: ['web', 'browser', 'testing'] }],
  ['mcp-memory', 'mcp', 'Graph Memory MCP', 'Consulta y asociación de memoria persistente', { source: 'aitmpl.com', sourceUrl: 'https://aitmpl.com/mcps', tags: ['memoria', 'grafo', 'mcp'] }],
  ['memory-local', 'memory', 'Memoria local persistente', 'Base SQLite privada almacenada en ~/.openclaw', { path: DB_PATH, tags: ['local', 'persistente', 'privada'] }],
];

const SEED_EDGES = [
  ['agent-general', 'skill-find', 'uses'],
  ['agent-general', 'skill-react', 'can_use'],
  ['agent-general', 'skill-browser', 'can_use'],
  ['agent-general', 'mcp-memory', 'uses'],
  ['agent-general', 'memory-local', 'remembers_in'],
];

function json(value, fallback = {}) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

export function initImanDb() {
  if (db) return;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS iman_nodes (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN ('agent','skill','mcp','tool','memory')),
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS iman_edges (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES iman_nodes(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES iman_nodes(id) ON DELETE CASCADE,
      relation TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(source_id, target_id, relation)
    );
    CREATE TABLE IF NOT EXISTS iman_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_iman_nodes_kind ON iman_nodes(kind);
    CREATE INDEX IF NOT EXISTS idx_iman_edges_source ON iman_edges(source_id);
    CREATE INDEX IF NOT EXISTS idx_iman_edges_target ON iman_edges(target_id);
  `);

  const now = new Date().toISOString();
  const insertNode = db.prepare('INSERT OR IGNORE INTO iman_nodes (id,kind,name,description,metadata,created_at,updated_at) VALUES (?,?,?,?,?,?,?)');
  const insertEdge = db.prepare('INSERT OR IGNORE INTO iman_edges (id,source_id,target_id,relation,created_at) VALUES (?,?,?,?,?)');
  for (const [id, kind, name, description, metadata] of SEED_NODES) {
    insertNode.run(id, kind, name, description, JSON.stringify(metadata), now, now);
  }
  for (const [source, target, relation] of SEED_EDGES) {
    insertEdge.run(`${source}:${relation}:${target}`, source, target, relation, now);
  }
  db.prepare('INSERT OR IGNORE INTO iman_settings (key,value,updated_at) VALUES (?,?,?)').run('active_agent_id', 'agent-general', now);
}

export function getImanMap() {
  const nodes = db.prepare('SELECT * FROM iman_nodes ORDER BY kind, name').all().map((row) => ({
    id: row.id, kind: row.kind, name: row.name, description: row.description,
    metadata: json(row.metadata), createdAt: row.created_at, updatedAt: row.updated_at,
  }));
  const edges = db.prepare('SELECT id, source_id AS source, target_id AS target, relation, created_at AS createdAt FROM iman_edges ORDER BY created_at').all();
  const activeAgentId = db.prepare("SELECT value FROM iman_settings WHERE key = 'active_agent_id'").get()?.value || null;
  return { nodes, edges, activeAgentId, dbPath: DB_PATH };
}

function upsertCapability(kind, name, sourceUrl = '') {
  const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const id = `${kind}-${slug || crypto.randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare('INSERT OR IGNORE INTO iman_nodes (id,kind,name,description,metadata,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, kind, name, '', JSON.stringify({ sourceUrl, tags: normalizeList(name) }), now, now);
  return id;
}

export function createImanAgent(input = {}) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('El nombre del agente es obligatorio');
  const id = `agent-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const metadata = {
    model: String(input.model || 'minimax-portal/MiniMax-M2.7').trim(),
    purpose: String(input.purpose || '').trim(),
    tags: normalizeList(input.tags),
    instructions: String(input.instructions || '').trim(),
  };
  db.prepare('INSERT INTO iman_nodes (id,kind,name,description,metadata,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, 'agent', name, String(input.description || '').trim(), JSON.stringify(metadata), now, now);

  const edge = db.prepare('INSERT OR IGNORE INTO iman_edges (id,source_id,target_id,relation,created_at) VALUES (?,?,?,?,?)');
  for (const skill of normalizeList(input.skills)) {
    const target = upsertCapability('skill', skill, 'https://www.skills.sh/');
    edge.run(crypto.randomUUID(), id, target, 'uses', now);
  }
  for (const mcp of normalizeList(input.mcps)) {
    const target = upsertCapability('mcp', mcp, 'https://aitmpl.com/mcps');
    edge.run(crypto.randomUUID(), id, target, 'uses', now);
  }
  edge.run(crypto.randomUUID(), id, 'memory-local', 'remembers_in', now);
  return id;
}

export function selectImanAgent(agentId) {
  const agent = db.prepare("SELECT id FROM iman_nodes WHERE id = ? AND kind = 'agent'").get(agentId);
  if (!agent) throw new Error('Agente no encontrado');
  const now = new Date().toISOString();
  db.prepare("INSERT INTO iman_settings (key,value,updated_at) VALUES ('active_agent_id',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at")
    .run(agentId, now);
  return agentId;
}

export function addImanMemory({ agentId, title, content, tags }) {
  const agent = db.prepare("SELECT id FROM iman_nodes WHERE id = ? AND kind = 'agent'").get(agentId);
  if (!agent) throw new Error('Agente no encontrado');
  const id = `memory-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare('INSERT INTO iman_nodes (id,kind,name,description,metadata,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, 'memory', String(title || 'Memoria').trim(), String(content || '').trim(), JSON.stringify({ tags: normalizeList(tags) }), now, now);
  db.prepare('INSERT INTO iman_edges (id,source_id,target_id,relation,created_at) VALUES (?,?,?,?,?)')
    .run(crypto.randomUUID(), agentId, id, 'remembers', now);
  return id;
}

export function recommendImanAgent(task = '') {
  const terms = new Set(String(task).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((term) => term.length > 2));
  const map = getImanMap();
  const outgoing = new Map();
  for (const edge of map.edges) {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source).push(map.nodes.find((node) => node.id === edge.target));
  }
  const ranked = map.nodes.filter((node) => node.kind === 'agent').map((agent) => {
    const related = (outgoing.get(agent.id) || []).filter(Boolean);
    const haystack = [agent.name, agent.description, agent.metadata.purpose, ...(agent.metadata.tags || []), ...related.flatMap((node) => [node.name, node.description, ...(node.metadata.tags || [])])]
      .join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const matchedTerms = [...terms].filter((term) => haystack.includes(term));
    return { agent, score: matchedTerms.length, matchedTerms, capabilities: related.map((node) => node.name) };
  }).sort((a, b) => b.score - a.score || a.agent.name.localeCompare(b.agent.name));
  return { recommendation: ranked[0] || null, alternatives: ranked.slice(1, 4) };
}
