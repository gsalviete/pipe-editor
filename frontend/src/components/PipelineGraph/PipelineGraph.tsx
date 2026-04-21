import { useCallback, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  MarkerType,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { PipelineGraph as PipelineGraphType, GraphNode } from '../../types/pipeline';
import { JobNode } from './JobNode';
import { STATUS_STYLES } from './StatusColors';

// ─── Adapters ─────────────────────────────────────────────────────────────────

function toFlowNodes(graphNodes: GraphNode[]): Node<GraphNode>[] {
  return graphNodes.map((n) => ({
    id: n.id,
    type: 'jobNode',
    position: n.position,
    data: n,
    draggable: true,
    selectable: true,
  }));
}

function toFlowEdges(graphEdges: PipelineGraphType['edges']): Edge[] {
  return graphEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: false,
    type: 'smoothstep',
    markerEnd: { type: MarkerType.ArrowClosed, color: '#30363d' },
    style: { stroke: '#30363d', strokeWidth: 1.5 },
    labelStyle: { fill: '#6e7681', fontSize: 10, fontFamily: 'monospace' },
    labelBgStyle: { fill: '#161b22', fillOpacity: 0.9 },
  }));
}

// ─── Node types registration ──────────────────────────────────────────────────

const nodeTypes: NodeTypes = { jobNode: JobNode };

// ─── MiniMap node coloring ────────────────────────────────────────────────────

function minimapNodeColor(node: Node<GraphNode>): string {
  return STATUS_STYLES[node.data.status]?.border ?? '#30363d';
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  graph: PipelineGraphType;
  onNodeClick: (node: GraphNode) => void;
}

export function PipelineGraph({ graph, onNodeClick }: Props) {
  // Internal state is the single source of truth for rendering.
  // Positions set here are preserved across re-renders (drag persists).
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphNode>(
    toFlowNodes(graph.nodes),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    toFlowEdges(graph.edges),
  );

  // When the graph prop changes (different workflow or run loaded),
  // reset nodes and edges from the new data. This is intentional: a new
  // graph load should reset positions, but re-renders from unrelated state
  // (e.g. selecting a node) do NOT change graph identity, so positions persist.
  useEffect(() => {
    setNodes(toFlowNodes(graph.nodes));
    setEdges(toFlowEdges(graph.edges));
  }, [graph, setNodes, setEdges]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<GraphNode>) => {
      onNodeClick(node.data);
    },
    [onNodeClick],
  );

  return (
    <div className="w-full h-full" style={{ background: '#0f1117' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { stroke: '#30363d' },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#21262d"
        />
        <Controls
          style={{
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 8,
          }}
        />
        <MiniMap
          nodeColor={minimapNodeColor}
          maskColor="rgba(15,17,23,0.8)"
          style={{
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: 8,
          }}
        />
      </ReactFlow>
    </div>
  );
}
