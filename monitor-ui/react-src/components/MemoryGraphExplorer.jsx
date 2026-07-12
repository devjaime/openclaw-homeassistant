import React, { useEffect, useMemo, useRef, useState } from 'react';

const COLORS = { platform: '#a78bfa', session: '#60a5fa', model: '#f59e0b', tool: '#22d3ee', memory: '#f472b6', database: '#34d399' };
const LABELS = { platform: 'Plataforma', session: 'Sesión', model: 'Modelo', tool: 'Herramienta', memory: 'Memoria', database: 'Base gráfica' };

function seededPosition(id, width, height) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = ((hash << 5) - hash + id.charCodeAt(index)) | 0;
  const angle = (Math.abs(hash) % 628) / 100;
  const radius = 80 + (Math.abs(hash >> 4) % Math.max(90, Math.min(width, height) / 2 - 60));
  return { x: width / 2 + Math.cos(angle) * radius, y: height / 2 + Math.sin(angle) * radius, vx: 0, vy: 0 };
}

export default function MemoryGraphExplorer({ graph }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const selectedRef = useRef(null);
  const [selectedId, setSelectedId] = useState(null);
  const [hiddenTypes, setHiddenTypes] = useState(new Set());

  const selected = useMemo(() => graph?.nodes?.find((node) => node.id === selectedId) || null, [graph?.nodes, selectedId]);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graph?.nodes?.length) return undefined;
    const context = canvas.getContext('2d');
    const width = canvas.clientWidth || 1000;
    const height = canvas.clientHeight || 620;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio; canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const nodes = graph.nodes.map((node) => ({ ...node, ...seededPosition(node.id, width, height) }));
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const links = graph.edges.map((edge) => ({ ...edge, sourceNode: byId.get(edge.source), targetNode: byId.get(edge.target) })).filter((edge) => edge.sourceNode && edge.targetNode);
    const state = { nodes, links, byId, transform: { x: 0, y: 0, scale: 1 }, dragged: null, panning: false, lastX: 0, lastY: 0, frame: 0, width, height };
    stateRef.current = state;

    const simulate = () => {
      const visible = nodes.filter((node) => !hiddenTypes.has(node.type));
      for (let left = 0; left < visible.length; left += 1) {
        for (let right = left + 1; right < visible.length; right += 1) {
          const a = visible[left]; const b = visible[right];
          const dx = b.x - a.x; const dy = b.y - a.y; const distanceSq = Math.max(90, dx * dx + dy * dy); const force = 1250 / distanceSq;
          const distance = Math.sqrt(distanceSq); const fx = (dx / distance) * force; const fy = (dy / distance) * force;
          a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
        }
      }
      for (const link of links) {
        if (hiddenTypes.has(link.sourceNode.type) || hiddenTypes.has(link.targetNode.type)) continue;
        const dx = link.targetNode.x - link.sourceNode.x; const dy = link.targetNode.y - link.sourceNode.y; const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const force = (distance - 125) * .0025; const fx = (dx / distance) * force; const fy = (dy / distance) * force;
        link.sourceNode.vx += fx; link.sourceNode.vy += fy; link.targetNode.vx -= fx; link.targetNode.vy -= fy;
      }
      for (const node of visible) {
        if (state.dragged === node) continue;
        node.vx += (width / 2 - node.x) * .00018; node.vy += (height / 2 - node.y) * .00018;
        node.vx *= .88; node.vy *= .88; node.x += node.vx; node.y += node.vy;
      }
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      context.save(); context.translate(state.transform.x, state.transform.y); context.scale(state.transform.scale, state.transform.scale);
      for (const link of links) {
        if (hiddenTypes.has(link.sourceNode.type) || hiddenTypes.has(link.targetNode.type)) continue;
        const highlighted = selectedRef.current && (link.source === selectedRef.current || link.target === selectedRef.current);
        context.beginPath(); context.moveTo(link.sourceNode.x, link.sourceNode.y); context.lineTo(link.targetNode.x, link.targetNode.y);
        context.strokeStyle = highlighted ? '#a78bfa' : 'rgba(100,116,139,.32)'; context.lineWidth = highlighted ? 2 : 1; context.stroke();
      }
      for (const node of nodes) {
        if (hiddenTypes.has(node.type)) continue;
        const selectedNode = node.id === selectedRef.current; const radius = node.type === 'platform' || node.type === 'database' ? 11 : selectedNode ? 9 : 6;
        context.beginPath(); context.arc(node.x, node.y, radius, 0, Math.PI * 2); context.fillStyle = COLORS[node.type] || '#94a3b8'; context.fill();
        if (selectedNode) { context.strokeStyle = '#fff'; context.lineWidth = 2; context.stroke(); }
        if (state.transform.scale > .65 || selectedNode || node.type === 'platform') {
          context.font = `${selectedNode ? 600 : 500} ${selectedNode ? 12 : 10}px system-ui`; context.fillStyle = selectedNode ? '#fff' : '#cbd5e1'; context.textAlign = 'center';
          const label = node.label.length > 34 ? `${node.label.slice(0, 32)}…` : node.label; context.fillText(label, node.x, node.y + radius + 14);
        }
      }
      context.restore();
    };

    let animation;
    const tick = () => { if (state.frame < 420 || state.dragged) simulate(); draw(); state.frame += 1; animation = requestAnimationFrame(tick); };
    tick();

    const point = (event) => ({ x: (event.offsetX - state.transform.x) / state.transform.scale, y: (event.offsetY - state.transform.y) / state.transform.scale });
    const hit = (event) => { const cursor = point(event); return [...nodes].reverse().find((node) => !hiddenTypes.has(node.type) && Math.hypot(node.x - cursor.x, node.y - cursor.y) < 16 / state.transform.scale); };
    const down = (event) => { const node = hit(event); state.lastX = event.offsetX; state.lastY = event.offsetY; if (node) { state.dragged = node; selectedRef.current = node.id; setSelectedId(node.id); } else state.panning = true; canvas.setPointerCapture(event.pointerId); };
    const move = (event) => { if (state.dragged) { const cursor = point(event); state.dragged.x = cursor.x; state.dragged.y = cursor.y; state.dragged.vx = 0; state.dragged.vy = 0; } else if (state.panning) { state.transform.x += event.offsetX - state.lastX; state.transform.y += event.offsetY - state.lastY; state.lastX = event.offsetX; state.lastY = event.offsetY; } canvas.style.cursor = hit(event) ? 'grab' : state.panning ? 'grabbing' : 'default'; };
    const up = (event) => { state.dragged = null; state.panning = false; state.frame = Math.min(state.frame, 390); try { canvas.releasePointerCapture(event.pointerId); } catch {} };
    const wheel = (event) => { event.preventDefault(); const oldScale = state.transform.scale; const nextScale = Math.max(.35, Math.min(3, oldScale * (event.deltaY < 0 ? 1.12 : .89))); const worldX = (event.offsetX - state.transform.x) / oldScale; const worldY = (event.offsetY - state.transform.y) / oldScale; state.transform.x = event.offsetX - worldX * nextScale; state.transform.y = event.offsetY - worldY * nextScale; state.transform.scale = nextScale; };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('wheel', wheel, { passive: false });
    return () => { cancelAnimationFrame(animation); canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('wheel', wheel); };
  }, [graph, hiddenTypes]);

  const toggleType = (type) => setHiddenTypes((current) => { const next = new Set(current); if (next.has(type)) next.delete(type); else next.add(type); return next; });
  const resetView = () => { if (stateRef.current) { stateRef.current.transform = { x: 0, y: 0, scale: 1 }; stateRef.current.frame = 0; } };

  return (
    <div className="obsidian-graph-shell">
      <div className="obsidian-toolbar"><div className="graph-filters">{Object.entries(LABELS).map(([type, label]) => <button key={type} className={hiddenTypes.has(type) ? 'muted' : ''} onClick={() => toggleType(type)}><i style={{ background: COLORS[type] }} />{label}</button>)}</div><button className="graph-reset" onClick={resetView}>Centrar</button></div>
      <div className="obsidian-canvas-wrap"><canvas ref={canvasRef} className="obsidian-canvas" />{selected ? <aside className="graph-node-detail"><span style={{ color: COLORS[selected.type] }}>{LABELS[selected.type]}</span><h4>{selected.label}</h4><p>{selected.detail || 'Sin detalle adicional'}</p>{selected.updatedAt ? <time>{new Date(selected.updatedAt).toLocaleString('es-CL')}</time> : null}<button onClick={() => setSelectedId(null)}>Cerrar</button></aside> : null}<div className="graph-help">Arrastra nodos · rueda para zoom · arrastra el fondo para mover</div></div>
    </div>
  );
}
