import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Atom,
  BookOpen,
  Brain,
  FlaskConical,
  Globe2,
  Heart,
  Leaf,
  Settings,
  Sparkles,
  Sun,
  Waves,
  Zap,
  ArrowRight,
  Play,
  Pause,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  Subject,
  VisualDiagram,
  VisualNodeColor,
  VisualNodeIcon,
  VisualStep,
} from '../types/learnpro';
import { sanitizeAnimatedSvg } from '../lib/svgSanitizer';
import { getStarterAnimatedSvg } from '../lib/starterSvgs';

interface Props {
  lessonId?: string;
  subject?: Subject;
  topicTitle?: string;
  storyIntro?: string;
  steps?: VisualStep[];
  animatedSvg?: string;
  diagram: VisualDiagram;
  activeStepIdx?: number;
  onSelectNode?: (index: number) => void;
}

const COLOR_MAP: Record<
  VisualNodeColor,
  { fill: string; stroke: string; text: string; bg: string; border: string; bar: string }
> = {
  sky: {
    fill: '#E0F2FE',
    stroke: '#0284C7',
    text: 'text-sky-800',
    bg: 'bg-sky-50',
    border: 'border-sky-300',
    bar: 'bg-sky-600',
  },
  emerald: {
    fill: '#D1FAE5',
    stroke: '#059669',
    text: 'text-emerald-800',
    bg: 'bg-emerald-50',
    border: 'border-emerald-300',
    bar: 'bg-emerald-600',
  },
  amber: {
    fill: '#FEF3C7',
    stroke: '#D97706',
    text: 'text-amber-800',
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    bar: 'bg-amber-500',
  },
  indigo: {
    fill: '#E0E7FF',
    stroke: '#4F46E5',
    text: 'text-indigo-800',
    bg: 'bg-indigo-50',
    border: 'border-indigo-300',
    bar: 'bg-indigo-600',
  },
  rose: {
    fill: '#FFE4E6',
    stroke: '#E11D48',
    text: 'text-rose-800',
    bg: 'bg-rose-50',
    border: 'border-rose-300',
    bar: 'bg-rose-600',
  },
};

function NodeIcon({ icon, className }: { icon: VisualNodeIcon; className?: string }) {
  switch (icon) {
    case 'sun':
      return <Sun className={className} />;
    case 'water':
      return <Waves className={className} />;
    case 'leaf':
      return <Leaf className={className} />;
    case 'bolt':
      return <Zap className={className} />;
    case 'atom':
      return <Atom className={className} />;
    case 'heart':
      return <Heart className={className} />;
    case 'gear':
      return <Settings className={className} />;
    case 'book':
      return <BookOpen className={className} />;
    case 'globe':
      return <Globe2 className={className} />;
    case 'flask':
      return <FlaskConical className={className} />;
    case 'brain':
      return <Brain className={className} />;
    default:
      return <Sparkles className={className} />;
  }
}

export const DynamicTopicVisual: React.FC<Props> = ({
  lessonId,
  subject,
  topicTitle = '',
  storyIntro = '',
  steps = [],
  animatedSvg,
  diagram,
  activeStepIdx = 0,
  onSelectNode,
}) => {
  const nodes = (diagram.nodes || []).slice(0, 6);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [autoPulse, setAutoPulse] = useState(true);
  const [generatedSvgs, setGeneratedSvgs] = useState<Record<string, string>>({});
  const [loadingSvg, setLoadingSvg] = useState(false);
  const [svgError, setSvgError] = useState<string | null>(null);
  const svgContainerRef = useRef<HTMLDivElement | null>(null);

  const cacheKey = lessonId || topicTitle;
  const starterSvg = useMemo(() => getStarterAnimatedSvg(topicTitle), [topicTitle]);
  const cleanSvg = useMemo(() => {
    const raw = animatedSvg || generatedSvgs[cacheKey] || starterSvg;
    return sanitizeAnimatedSvg(raw);
  }, [animatedSvg, generatedSvgs, cacheKey, starterSvg]);

  async function requestDiagramSvg() {
    if (!topicTitle || loadingSvg) return;
    setLoadingSvg(true);
    setSvgError(null);
    try {
      const resp = await fetch('/api/lessons/diagram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          topicTitle,
          storyIntro,
          steps,
        }),
      });
      const rawText = await resp.text();
      let data: { animatedSvg?: string; error?: string } = {};
      try {
        data = JSON.parse(rawText);
      } catch {
        data = {};
      }
      if (!resp.ok || !data.animatedSvg) {
        throw new Error(data.error || 'Could not draw animated diagram right now.');
      }
      setGeneratedSvgs((prev) => ({ ...prev, [cacheKey]: data.animatedSvg! }));
    } catch (err) {
      setSvgError(err instanceof Error ? err.message : 'Diagram unavailable right now.');
    } finally {
      setLoadingSvg(false);
    }
  }

  // Automatically fetch a custom animated SVG illustration if an older lesson does not have one yet
  useEffect(() => {
    if (!cleanSvg && topicTitle && !generatedSvgs[cacheKey] && !svgError) {
      requestDiagramSvg();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, cleanSvg, topicTitle]);

  useEffect(() => {
    if (nodes.length > 0) {
      setSelectedIdx(activeStepIdx % nodes.length);
    }
  }, [activeStepIdx, nodes.length]);

  useEffect(() => {
    if (!autoPulse || nodes.length <= 1) return;
    const t = window.setInterval(() => {
      setSelectedIdx((prev) => (prev + 1) % nodes.length);
    }, 3800);
    return () => window.clearInterval(t);
  }, [autoPulse, nodes.length]);

  // Sync Play/Pause state with native SVG animations inside cleanSvg
  useEffect(() => {
    const svgEl = svgContainerRef.current?.querySelector('svg');
    if (!svgEl) return;
    try {
      if (autoPulse) {
        svgEl.unpauseAnimations?.();
      } else {
        svgEl.pauseAnimations?.();
      }
    } catch {
      // ignore browsers without SMIL pause API
    }
  }, [autoPulse, cleanSvg]);

  if (nodes.length === 0 && !cleanSvg) return null;

  const activeNode = nodes[Math.min(selectedIdx, Math.max(0, nodes.length - 1))];
  const activeStyle = activeNode ? COLOR_MAP[activeNode.color] || COLOR_MAP.sky : COLOR_MAP.sky;

  const handlePickNode = (idx: number) => {
    setAutoPulse(false);
    setSelectedIdx(idx);
    onSelectNode?.(idx);
  };

  return (
    <div className="space-y-4">
      {/* Diagram Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-sky-700">
            Animated Concept Illustration &amp; Interactive Diagram
          </div>
          <h3 className="text-base font-bold text-slate-900">
            {diagram.diagramTitle || topicTitle}
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">{diagram.caption}</p>
        </div>
        <div className="flex items-center gap-2">
          {topicTitle && (
            <button
              type="button"
              disabled={loadingSvg}
              onClick={requestDiagramSvg}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
              title="Regenerate animated illustration"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingSvg ? 'animate-spin' : ''}`} />
              Redraw
            </button>
          )}
          <button
            type="button"
            onClick={() => setAutoPulse(!autoPulse)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
          >
            {autoPulse ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {autoPulse ? 'Pause Animation' : 'Play Animation'}
          </button>
        </div>
      </div>

      {/* Primary Concept-Specific Animated SVG Illustration */}
      {loadingSvg && !cleanSvg ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 h-64 flex flex-col items-center justify-center gap-2 text-xs text-slate-600">
          <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
          <span className="font-medium">Drawing &amp; animating diagram for “{topicTitle}”...</span>
        </div>
      ) : cleanSvg ? (
        <div
          ref={svgContainerRef}
          className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-xs"
          dangerouslySetInnerHTML={{ __html: cleanSvg }}
        />
      ) : svgError ? (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-3">
          <span>{svgError}</span>
          <button
            type="button"
            onClick={requestDiagramSvg}
            className="px-2.5 py-1 bg-amber-600 text-white rounded font-semibold hover:bg-amber-700 shrink-0"
          >
            Retry Diagram
          </button>
        </div>
      ) : null}

      {/* Interactive Clickable Parts Breakdown (synced with Guided Steps) */}
      {nodes.length > 0 && (
        <div className="space-y-3 pt-1">
          <div className="text-xs font-semibold text-slate-600 flex items-center justify-between">
            <span>Interactive Concept Stages — Click any part to inspect</span>
            <span className="font-mono text-slate-500">
              {selectedIdx + 1}/{nodes.length}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {nodes.map((node, i) => {
              const isSelected = i === selectedIdx;
              const c = COLOR_MAP[node.color] || COLOR_MAP.sky;
              const conn = diagram.connections?.find((cn) => cn.fromIndex === i);
              return (
                <button
                  key={node.id || i}
                  type="button"
                  onClick={() => handlePickNode(i)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    isSelected
                      ? `${c.bg} ${c.border} shadow-sm ring-1 ring-sky-300`
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${c.text}`}
                    >
                      <NodeIcon icon={node.icon} className="w-3.5 h-3.5" />
                      {node.roleOrValue || `Part ${i + 1}`}
                    </span>
                    {conn && i < nodes.length - 1 && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                        {conn.label.slice(0, 14)}
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-xs text-slate-900 mt-1">{node.label}</div>
                </button>
              );
            })}
          </div>

          {activeNode && (
            <div className={`p-3.5 rounded-xl border ${activeStyle.bg} ${activeStyle.border} space-y-1`}>
              <div className={`inline-flex items-center gap-1.5 text-xs font-bold ${activeStyle.text}`}>
                <NodeIcon icon={activeNode.icon} className="w-4 h-4" />
                <span>
                  {activeNode.label} · {activeNode.roleOrValue}
                </span>
              </div>
              <p className="text-xs text-slate-800 leading-relaxed">{activeNode.description}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
