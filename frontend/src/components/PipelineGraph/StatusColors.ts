import type { NodeStatus } from '../../types/pipeline';

export interface StatusStyle {
  border: string;
  bg: string;
  text: string;
  badge: string;
  glow?: string;
}

export const STATUS_STYLES: Record<NodeStatus, StatusStyle> = {
  idle: {
    border: '#30363d',
    bg: '#161b22',
    text: '#8b949e',
    badge: 'bg-gray-700 text-gray-400',
  },
  queued: {
    border: '#388bfd',
    bg: '#0d1117',
    text: '#79c0ff',
    badge: 'bg-blue-900 text-blue-300',
    glow: '0 0 8px rgba(56,139,253,0.4)',
  },
  running: {
    border: '#d29922',
    bg: '#161008',
    text: '#e3b341',
    badge: 'bg-yellow-900 text-yellow-300',
    glow: '0 0 10px rgba(210,153,34,0.5)',
  },
  success: {
    border: '#3fb950',
    bg: '#0d1a0d',
    text: '#56d364',
    badge: 'bg-green-900 text-green-300',
  },
  failure: {
    border: '#f85149',
    bg: '#1a0d0d',
    text: '#ff7b72',
    badge: 'bg-red-900 text-red-300',
    glow: '0 0 8px rgba(248,81,73,0.4)',
  },
  cancelled: {
    border: '#6e7681',
    bg: '#161b22',
    text: '#8b949e',
    badge: 'bg-gray-700 text-gray-400',
  },
  skipped: {
    border: '#30363d',
    bg: '#161b22',
    text: '#6e7681',
    badge: 'bg-gray-800 text-gray-500',
  },
  timed_out: {
    border: '#f0883e',
    bg: '#1a1008',
    text: '#ffa657',
    badge: 'bg-orange-900 text-orange-300',
  },
};

export const STATUS_LABEL: Record<NodeStatus, string> = {
  idle: 'Not run',
  queued: 'Queued',
  running: 'Running',
  success: 'Success',
  failure: 'Failed',
  cancelled: 'Cancelled',
  skipped: 'Skipped',
  timed_out: 'Timed out',
};
