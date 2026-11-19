import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Zap,
  Droplets,
  Sun,
  ArrowRight,
  Cpu,
  Compass,
  Layers,
  RotateCcw,
  Sparkles,
  Sliders,
} from 'lucide-react';
import { Subject, VisualDiagram, VisualNodeColor, VisualStep, VisualType } from '../types/learnpro';
import { DynamicTopicVisual } from './DynamicTopicVisual';

interface Props {
  lessonId?: string;
  subject?: Subject;
  storyIntro?: string;
  visualType: VisualType;
  topicTitle: string;
  animatedSvg?: string;
  visualDiagram?: VisualDiagram;
  steps?: VisualStep[];
  activeStepIdx?: number;
  onSelectStep?: (idx: number) => void;
}

const FALLBACK_COLORS: VisualNodeColor[] = ['sky', 'emerald', 'amber', 'indigo', 'rose'];

export const InteractiveVisualStage: React.FC<Props> = ({
  lessonId,
  subject,
  storyIntro,
  visualType,
  topicTitle,
  animatedSvg,
  visualDiagram,
  steps = [],
  activeStepIdx = 0,
  onSelectStep,
}) => {
  const effectiveDiagram: VisualDiagram | null =
    visualDiagram && visualDiagram.nodes && visualDiagram.nodes.length > 0
      ? visualDiagram
      : steps.length > 0
      ? {
          diagramTitle: topicTitle,
          diagramStyle: 'process_flow',
          caption: 'Watch the animated concept illustration and click any stage to inspect it.',
          flowLabel: `${topicTitle} · Step Flow`,
          nodes: steps.slice(0, 5).map((s, idx) => ({
            id: `step_${idx + 1}`,
            label: s.stageTitle,
            roleOrValue: `Stage ${idx + 1}`,
            description: `${s.explanation} Example: ${s.realLifeExample}`,
            icon: 'star',
            color: FALLBACK_COLORS[idx % FALLBACK_COLORS.length],
          })),
          connections: steps.slice(0, -1).map((_s, idx) => ({
            fromIndex: idx,
            toIndex: idx + 1,
            label: 'Next',
          })),
        }
      : null;

  const [stageTab, setStageTab] = useState<'diagram' | 'sandbox'>('diagram');

  useEffect(() => {
    setStageTab('diagram');
  }, [lessonId, topicTitle]);

  const renderSandbox = () => {
    if (visualType === 'fractions_geometry') {
      return <MathVisualStage topicTitle={topicTitle} />;
    }
    if (visualType === 'science_lab') {
      return <ScienceVisualStage />;
    }
    if (visualType === 'english_story') {
      return <EnglishVisualStage />;
    }
    if (visualType === 'humanities_atlas') {
      return <HumanitiesVisualStage />;
    }
    return <ComputingVisualStage />;
  };

  return (
    <div className="space-y-4">
      {effectiveDiagram && (
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setStageTab('diagram')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                stageTab === 'diagram'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-600" />
              Animated Concept Diagram
            </button>
            <button
              type="button"
              onClick={() => setStageTab('sandbox')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                stageTab === 'sandbox'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-emerald-600" />
              Interactive Subject Lab
            </button>
          </div>
        </div>
      )}

      {stageTab === 'diagram' && effectiveDiagram ? (
        <DynamicTopicVisual
          lessonId={lessonId}
          subject={subject}
          topicTitle={topicTitle}
          storyIntro={storyIntro}
          steps={steps}
          animatedSvg={animatedSvg}
          diagram={effectiveDiagram}
          activeStepIdx={activeStepIdx}
          onSelectNode={onSelectStep}
        />
      ) : (
        renderSandbox()
      )}
    </div>
  );
};

/* ---------------- 1. MATHEMATICS: FRACTIONS, NUMBER LINE & POLYGONS ---------------- */
const MathVisualStage: React.FC<{ topicTitle: string }> = ({ topicTitle }) => {
  const defaultTab = topicTitle.toLowerCase().includes('polygon') ? 'geometry' : 'fractions';
  const [mode, setMode] = useState<'fractions' | 'geometry'>(defaultTab);
  const [numA, setNumA] = useState(1);
  const [denA, setDenA] = useState(2);
  const [numB, setNumB] = useState(1);
  const [denB, setDenB] = useState(4);
  const [sides, setSides] = useState(5);

  const valA = numA / denA;
  const valB = numB / denB;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const lcm = (denA * denB) / gcd(denA, denB);
  const eqNumA = numA * (lcm / denA);
  const eqNumB = numB * (lcm / denB);
  const sumNum = eqNumA + eqNumB;
  const isEquivalent = Math.abs(valA - valB) < 0.0001;

  // Geometry polygon vertices
  const polygonPoints = Array.from({ length: sides }, (_, i) => {
    const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
    const x = 140 + 82 * Math.cos(angle);
    const y = 115 + 82 * Math.sin(angle);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const polygonNames: Record<number, string> = {
    3: 'Equilateral Triangle',
    4: 'Square (Quadrilateral)',
    5: 'Regular Pentagon',
    6: 'Regular Hexagon',
    7: 'Regular Heptagon',
    8: 'Regular Octagon',
  };

  const interiorAngle = Math.round(((sides - 2) * 180) / sides);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            {mode === 'fractions' ? 'Fraction Bar & Number Line Explorer' : 'Regular Polygon Geometry Builder'}
          </h3>
          <p className="text-xs text-slate-500">
            {mode === 'fractions'
              ? 'Drag the sliders to see how equal parts compare and combine'
              : 'Adjust the number of sides to inspect angles and symmetry'}
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setMode('fractions')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              mode === 'fractions' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Fractions & Addition
          </button>
          <button
            type="button"
            onClick={() => setMode('geometry')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              mode === 'geometry' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Polygons & Angles
          </button>
        </div>
      </div>

      {mode === 'fractions' ? (
        <div className="space-y-5">
          {/* Visual Bars */}
          <div className="space-y-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
            {/* Bar A */}
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
                <span>Fraction A</span>
                <span className="font-mono tabular-nums text-sky-700">
                  {numA}/{denA} ({Math.round(valA * 100)}%)
                </span>
              </div>
              <div className="grid gap-1 h-9" style={{ gridTemplateColumns: `repeat(${denA}, minmax(0, 1fr))` }}>
                {Array.from({ length: denA }).map((_, i) => (
                  <div
                    key={i}
                    className={`rounded border transition-colors ${
                      i < numA ? 'bg-sky-600 border-sky-700' : 'bg-white border-slate-300'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Bar B */}
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
                <span>Fraction B</span>
                <span className="font-mono tabular-nums text-emerald-700">
                  {numB}/{denB} ({Math.round(valB * 100)}%)
                </span>
              </div>
              <div className="grid gap-1 h-9" style={{ gridTemplateColumns: `repeat(${denB}, minmax(0, 1fr))` }}>
                {Array.from({ length: denB }).map((_, i) => (
                  <div
                    key={i}
                    className={`rounded border transition-colors ${
                      i < numB ? 'bg-emerald-600 border-emerald-700' : 'bg-white border-slate-300'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Common Denominator & Sum Bar */}
            <div className="pt-3 border-t border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-800 mb-1.5">
                <span>
                  Combined Equal Slices (Common Denominator = <span className="font-mono">{lcm}</span>)
                </span>
                <span className="font-mono tabular-nums text-slate-900">
                  {eqNumA}/{lcm} + {eqNumB}/{lcm} = {sumNum}/{lcm}
                </span>
              </div>
              <div
                className="grid gap-1 h-9"
                style={{ gridTemplateColumns: `repeat(${Math.max(lcm, sumNum)}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: Math.max(lcm, sumNum) }).map((_, i) => {
                  const isFromA = i < eqNumA;
                  const isFromB = i >= eqNumA && i < sumNum;
                  return (
                    <div
                      key={i}
                      className={`rounded border transition-colors ${
                        isFromA
                          ? 'bg-sky-600 border-sky-700'
                          : isFromB
                          ? 'bg-emerald-600 border-emerald-700'
                          : 'bg-white border-slate-300'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Number Line 0 to 1 */}
            <div className="pt-2">
              <div className="text-xs font-medium text-slate-600 mb-2">Position on Number Line (0 to 1)</div>
              <div className="relative h-8 flex items-center">
                <div className="w-full h-1 bg-slate-300 rounded" />
                {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
                  <div
                    key={tick}
                    className="absolute top-2.5 flex flex-col items-center -translate-x-1/2"
                    style={{ left: `${tick * 100}%` }}
                  >
                    <div className="w-0.5 h-3 bg-slate-400" />
                    <span className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">{tick}</span>
                  </div>
                ))}
                <div
                  className="absolute top-1 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-sky-600 border-2 border-white shadow"
                  style={{ left: `${Math.min(100, valA * 100)}%` }}
                  title={`Fraction A: ${numA}/${denA}`}
                />
                <div
                  className="absolute top-1 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-emerald-600 border-2 border-white shadow"
                  style={{ left: `${Math.min(100, valB * 100)}%` }}
                  title={`Fraction B: ${numB}/${denB}`}
                />
              </div>
            </div>
          </div>

          {/* Equivalence Banner */}
          <div
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-xs font-medium ${
              isEquivalent
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <CheckCircle2 className={`w-4 h-4 shrink-0 ${isEquivalent ? 'text-emerald-600' : 'text-slate-400'}`} />
            {isEquivalent ? (
              <span>
                Equivalent Match: <strong>{numA}/{denA}</strong> covers the exact same amount as{' '}
                <strong>{numB}/{denB}</strong>.
              </span>
            ) : (
              <span>
                Comparison:{' '}
                <strong>
                  {numA}/{denA} {valA > valB ? '>' : '<'} {numB}/{denB}
                </strong>
                . Try setting A = 1/2 and B = 2/4 to see equivalence!
              </span>
            )}
          </div>

          {/* Sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 border border-slate-200 rounded-lg bg-white space-y-3">
              <div className="text-xs font-bold text-sky-700">Fraction A Controls</div>
              <label className="block text-xs text-slate-700">
                <div className="flex justify-between mb-1">
                  <span>Numerator (Top)</span>
                  <span className="font-mono tabular-nums font-semibold">{numA}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={denA}
                  value={numA}
                  onChange={(e) => setNumA(Number(e.target.value))}
                  className="w-full accent-sky-600"
                />
              </label>
              <label className="block text-xs text-slate-700">
                <div className="flex justify-between mb-1">
                  <span>Denominator (Equal Parts)</span>
                  <span className="font-mono tabular-nums font-semibold">{denA}</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={8}
                  value={denA}
                  onChange={(e) => {
                    const nextDen = Number(e.target.value);
                    setDenA(nextDen);
                    if (numA > nextDen) setNumA(nextDen);
                  }}
                  className="w-full accent-sky-600"
                />
              </label>
            </div>

            <div className="p-3.5 border border-slate-200 rounded-lg bg-white space-y-3">
              <div className="text-xs font-bold text-emerald-700">Fraction B Controls</div>
              <label className="block text-xs text-slate-700">
                <div className="flex justify-between mb-1">
                  <span>Numerator (Top)</span>
                  <span className="font-mono tabular-nums font-semibold">{numB}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={denB}
                  value={numB}
                  onChange={(e) => setNumB(Number(e.target.value))}
                  className="w-full accent-emerald-600"
                />
              </label>
              <label className="block text-xs text-slate-700">
                <div className="flex justify-between mb-1">
                  <span>Denominator (Equal Parts)</span>
                  <span className="font-mono tabular-nums font-semibold">{denB}</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={8}
                  value={denB}
                  onChange={(e) => {
                    const nextDen = Number(e.target.value);
                    setDenB(nextDen);
                    if (numB > nextDen) setNumB(nextDen);
                  }}
                  className="w-full accent-emerald-600"
                />
              </label>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-center bg-slate-50 border border-slate-200 rounded-xl p-5">
          <div className="flex justify-center">
            <svg viewBox="0 0 280 230" className="w-64 h-52">
              <polygon
                points={polygonPoints}
                fill="#E0F2FE"
                stroke="#0284C7"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              {Array.from({ length: sides }).map((_, i) => {
                const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
                const x = 140 + 82 * Math.cos(angle);
                const y = 115 + 82 * Math.sin(angle);
                return <circle key={i} cx={x} cy={y} r="4.5" fill="#0369A1" />;
              })}
              <text x="140" y="118" textAnchor="middle" className="fill-slate-900 font-bold text-sm">
                {sides} Sides
              </text>
            </svg>
          </div>
          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold text-sky-700">Shape Classification</div>
              <div className="text-lg font-bold text-slate-900">{polygonNames[sides]}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-white border border-slate-200 rounded-lg">
                <div className="text-slate-500">Each Interior Angle</div>
                <div className="text-base font-bold font-mono tabular-nums text-slate-900">{interiorAngle}°</div>
              </div>
              <div className="p-3 bg-white border border-slate-200 rounded-lg">
                <div className="text-slate-500">Total Angle Sum</div>
                <div className="text-base font-bold font-mono tabular-nums text-slate-900">
                  {(sides - 2) * 180}°
                </div>
              </div>
            </div>
            <label className="block text-xs text-slate-700">
              <div className="flex justify-between mb-1">
                <span>Number of Equal Sides</span>
                <span className="font-mono tabular-nums font-bold">{sides}</span>
              </div>
              <input
                type="range"
                min={3}
                max={8}
                value={sides}
                onChange={(e) => setSides(Number(e.target.value))}
                className="w-full accent-sky-600"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------------- 2. SCIENCE: ELECTRIC CIRCUIT & PLANT VASCULAR LAB ---------------- */
const ScienceVisualStage: React.FC = () => {
  const [labMode, setLabMode] = useState<'circuit' | 'plant'>('circuit');
  const [switchClosed, setSwitchClosed] = useState(true);
  const [voltage, setVoltage] = useState(6);
  const [resistance, setResistance] = useState(2);

  const [sunlight, setSunlight] = useState(75);
  const [soilWater, setSoilWater] = useState(80);

  const currentAmps = switchClosed ? Number((voltage / resistance).toFixed(1)) : 0;
  const glowOpacity = switchClosed ? Math.min(1, currentAmps / 4.5) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            {labMode === 'circuit' ? 'Interactive Electric Circuit Lab' : 'Plant Xylem & Phloem Transport Lab'}
          </h3>
          <p className="text-xs text-slate-500">
            {labMode === 'circuit'
              ? 'Toggle the switch and adjust voltage to observe current flow and bulb brightness'
              : 'Adjust sunlight and soil moisture to trace water (Xylem) and sugar (Phloem) movement'}
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setLabMode('circuit')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              labMode === 'circuit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Electric Circuit
          </button>
          <button
            type="button"
            onClick={() => setLabMode('plant')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              labMode === 'plant' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Plant Transport
          </button>
        </div>
      </div>

      {labMode === 'circuit' ? (
        <div className="space-y-4">
          <div className="bg-slate-900 rounded-xl p-5 text-white relative overflow-hidden">
            <svg viewBox="0 0 420 210" className="w-full max-w-md mx-auto h-52">
              {/* Circuit Loop */}
              <path
                d="M 70 50 L 180 50 M 240 50 L 350 50 L 350 165 L 70 165 Z"
                fill="none"
                stroke={switchClosed ? '#38BDF8' : '#475569'}
                strokeWidth="4"
                strokeLinejoin="round"
              />
              {/* Switch blade */}
              <line
                x1="180"
                y1="50"
                x2={switchClosed ? '240' : '230'}
                y2={switchClosed ? '50' : '22'}
                stroke={switchClosed ? '#34D399' : '#F59E0B'}
                strokeWidth="4"
                strokeLinecap="round"
              />
              <circle cx="180" cy="50" r="5" fill="#E2E8F0" />
              <circle cx="240" cy="50" r="5" fill="#E2E8F0" />
              <text x="210" y="18" textAnchor="middle" className="fill-slate-300 text-[11px] font-semibold">
                {switchClosed ? 'SWITCH CLOSED' : 'SWITCH OPEN (GAP)'}
              </text>

              {/* Flowing electrons when closed */}
              {switchClosed && (
                <>
                  <circle r="5" fill="#FDE047">
                    <animateMotion
                      dur={`${Math.max(0.9, 4.5 / Math.max(0.5, currentAmps))}s`}
                      repeatCount="indefinite"
                      path="M 70 50 L 350 50 L 350 165 L 70 165 Z"
                    />
                  </circle>
                  <circle r="5" fill="#FDE047">
                    <animateMotion
                      dur={`${Math.max(0.9, 4.5 / Math.max(0.5, currentAmps))}s`}
                      begin="-1.2s"
                      repeatCount="indefinite"
                      path="M 70 50 L 350 50 L 350 165 L 70 165 Z"
                    />
                  </circle>
                </>
              )}

              {/* Battery on left */}
              <rect x="44" y="82" width="52" height="50" rx="6" fill="#1E293B" stroke="#94A3B8" strokeWidth="2" />
              <text x="70" y="106" textAnchor="middle" className="fill-sky-300 text-xs font-bold">
                {voltage}V
              </text>
              <text x="70" y="122" textAnchor="middle" className="fill-slate-400 text-[10px]">
                BATTERY
              </text>

              {/* Bulb on right */}
              <circle
                cx="350"
                cy="107"
                r={26 + glowOpacity * 12}
                fill={`rgba(250, 204, 21, ${glowOpacity * 0.35})`}
              />
              <circle
                cx="350"
                cy="107"
                r="20"
                fill={switchClosed ? `rgba(253, 224, 71, ${0.3 + glowOpacity * 0.7})` : '#334155'}
                stroke="#E2E8F0"
                strokeWidth="2.5"
              />
              <text x="350" y="111" textAnchor="middle" className="fill-slate-900 text-[11px] font-bold">
                {switchClosed ? 'LIT' : 'OFF'}
              </text>
            </svg>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3 text-xs">
              <div className="flex items-center gap-2">
                <Zap className={`w-4 h-4 ${switchClosed ? 'text-amber-400' : 'text-slate-500'}`} />
                <span className="font-mono tabular-nums">
                  Current: <strong>{currentAmps} A</strong> · Status:{' '}
                  <strong>{switchClosed ? 'Complete Loop' : 'Broken Loop'}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSwitchClosed(!switchClosed)}
                className={`px-3.5 py-1.5 rounded-lg font-semibold transition-colors ${
                  switchClosed
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                }`}
              >
                {switchClosed ? 'Open Switch' : 'Close Switch'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block p-3.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700">
              <div className="flex justify-between mb-1">
                <span>Battery Voltage</span>
                <span className="font-mono tabular-nums font-bold text-sky-700">{voltage} V</span>
              </div>
              <input
                type="range"
                min={1.5}
                max={9}
                step={1.5}
                value={voltage}
                onChange={(e) => setVoltage(Number(e.target.value))}
                className="w-full accent-sky-600"
              />
            </label>
            <label className="block p-3.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700">
              <div className="flex justify-between mb-1">
                <span>Wire / Bulb Resistance</span>
                <span className="font-mono tabular-nums font-bold text-slate-900">{resistance} Ω</span>
              </div>
              <input
                type="range"
                min={1}
                max={6}
                step={1}
                value={resistance}
                onChange={(e) => setResistance(Number(e.target.value))}
                className="w-full accent-slate-700"
              />
            </label>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
            <svg viewBox="0 0 400 200" className="w-full max-w-md mx-auto h-48">
              {/* Sun */}
              <circle cx="345" cy="38" r={16 + (sunlight / 100) * 8} fill="#FACC15" opacity={0.3 + (sunlight / 100) * 0.7} />
              <text x="345" y="74" textAnchor="middle" className="fill-amber-700 text-[10px] font-bold">
                Sunlight {sunlight}%
              </text>
              {/* Soil */}
              <rect x="40" y="160" width="320" height="30" rx="6" fill="#D6D3D1" />
              <text x="200" y="180" textAnchor="middle" className="fill-slate-700 text-[11px] font-semibold">
                Soil Moisture: {soilWater}%
              </text>
              {/* Stem tubes */}
              <rect x="178" y="65" width="16" height="95" fill="#0EA5E9" rx="4" opacity={0.2 + (soilWater / 100) * 0.8} />
              <rect x="206" y="65" width="16" height="95" fill="#EAB308" rx="4" opacity={0.2 + (sunlight / 100) * 0.8} />
              {/* Leaves */}
              <ellipse cx="145" cy="65" rx="46" ry="20" fill="#10B981" />
              <ellipse cx="255" cy="65" rx="46" ry="20" fill="#059669" />
              <text x="145" y="69" textAnchor="middle" className="fill-white text-[10px] font-bold">
                XYLEM (Water Up)
              </text>
              <text x="255" y="69" textAnchor="middle" className="fill-white text-[10px] font-bold">
                PHLOEM (Sugar Down)
              </text>
              {/* Animated droplets */}
              {soilWater > 10 && (
                <circle cx="186" cy="145" r="4" fill="#0284C7">
                  <animate attributeName="cy" from="155" to="72" dur={`${Math.max(1, 3.2 - soilWater / 45)}s`} repeatCount="indefinite" />
                </circle>
              )}
              {sunlight > 10 && (
                <circle cx="214" cy="75" r="4" fill="#CA8A04">
                  <animate attributeName="cy" from="72" to="155" dur={`${Math.max(1, 3.2 - sunlight / 45)}s`} repeatCount="indefinite" />
                </circle>
              )}
            </svg>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block p-3.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700">
              <div className="flex justify-between mb-1">
                <span className="inline-flex items-center gap-1"><Droplets className="w-3.5 h-3.5 text-sky-600" /> Soil Water (Xylem)</span>
                <span className="font-mono tabular-nums font-bold text-sky-700">{soilWater}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={soilWater}
                onChange={(e) => setSoilWater(Number(e.target.value))}
                className="w-full accent-sky-600"
              />
            </label>
            <label className="block p-3.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700">
              <div className="flex justify-between mb-1">
                <span className="inline-flex items-center gap-1"><Sun className="w-3.5 h-3.5 text-amber-500" /> Sunlight (Phloem Sugar)</span>
                <span className="font-mono tabular-nums font-bold text-amber-700">{sunlight}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={sunlight}
                onChange={(e) => setSunlight(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------------- 3. ENGLISH: SENTENCE & VOCABULARY BUILDER ---------------- */
const EnglishVisualStage: React.FC = () => {
  const [adjective, setAdjective] = useState('curious');
  const [subject, setSubject] = useState('explorer');
  const [verb, setVerb] = useState('discovered');
  const [place, setPlace] = useState('inside the hidden cavern');

  const adjectives = ['curious', 'nervous', 'determined', 'observant'];
  const subjects = ['explorer', 'scientist', 'young traveler', 'inventor'];
  const verbs = ['discovered', 'sketched', 'tiptoed past', 'measured'];
  const places = [
    'inside the hidden cavern',
    'across the misty rope bridge',
    'beside the ancient riverbank',
    'under the glowing lantern',
  ];

  return (
    <div className="space-y-5">
      <div className="border-b border-slate-200 pb-3">
        <h3 className="text-base font-bold text-slate-900">Visual Sentence Construction Lab</h3>
        <p className="text-xs text-slate-500">
          Pick one block from each grammar role to see how words build a vivid mental picture
        </p>
      </div>

      {/* Live Assembled Sentence */}
      <div className="bg-slate-900 text-white rounded-xl p-5 space-y-3">
        <div className="text-xs font-medium text-slate-400">Your Assembled Picture Sentence</div>
        <div className="text-xl sm:text-2xl font-display font-bold leading-snug flex flex-wrap gap-2 items-baseline">
          <span className="text-slate-300">The</span>
          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40">{adjective}</span>
          <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/40">{subject}</span>
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">{verb}</span>
          <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-400/40">{place}.</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800 text-xs">
          <div>
            <span className="text-amber-300 font-semibold">Adjective:</span> Describes mood/trait
          </div>
          <div>
            <span className="text-sky-300 font-semibold">Subject:</span> Who is acting
          </div>
          <div>
            <span className="text-emerald-300 font-semibold">Verb:</span> The clear action
          </div>
          <div>
            <span className="text-indigo-300 font-semibold">Phrase:</span> Where it happens
          </div>
        </div>
      </div>

      {/* Interactive Tile Pickers */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-2">
          <div className="text-xs font-bold text-amber-700">1. Choose Adjective (Describing Word)</div>
          <div className="flex flex-wrap gap-1.5">
            {adjectives.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setAdjective(w)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  adjective === w
                    ? 'bg-amber-50 border-amber-400 text-amber-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-2">
          <div className="text-xs font-bold text-sky-700">2. Choose Subject (Who?)</div>
          <div className="flex flex-wrap gap-1.5">
            {subjects.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setSubject(w)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  subject === w
                    ? 'bg-sky-50 border-sky-400 text-sky-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-2">
          <div className="text-xs font-bold text-emerald-700">3. Choose Action Verb</div>
          <div className="flex flex-wrap gap-1.5">
            {verbs.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setVerb(w)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  verb === w
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-2">
          <div className="text-xs font-bold text-indigo-700">4. Choose Location Phrase (Where?)</div>
          <div className="flex flex-wrap gap-1.5">
            {places.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setPlace(w)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  place === w
                    ? 'bg-indigo-50 border-indigo-400 text-indigo-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------------- 4. HUMANITIES: TIMELINE & RIVER CIVILIZATION ATLAS ---------------- */
const HumanitiesVisualStage: React.FC = () => {
  const eras = [
    {
      id: 'mesopotamia',
      name: 'Mesopotamia',
      era: '3500 BCE',
      river: 'Tigris & Euphrates',
      cause: 'Unpredictable river floods required irrigation canals and clay levees.',
      effect: 'Built stepped ziggurats, cuneiform clay writing, and the wheel.',
      x: 195,
      y: 95,
    },
    {
      id: 'egypt',
      name: 'Ancient Egypt',
      era: '3100 BCE',
      river: 'Nile River',
      cause: 'Gentle annual Nile flooding left rich black soil along a narrow valley.',
      effect: 'Grew abundant wheat surpluses, enabling pyramids and papyrus scrolls.',
      x: 120,
      y: 112,
    },
    {
      id: 'indus',
      name: 'Indus Valley',
      era: '2600 BCE',
      river: 'Indus River',
      cause: 'Monsoon rains fed wide river plains ideal for cotton and grain.',
      effect: 'Designed grid-planned brick cities with covered drainage systems.',
      x: 295,
      y: 120,
    },
  ];

  const [selectedId, setSelectedId] = useState('egypt');
  const [showRivers, setShowRivers] = useState(true);
  const [showTrade, setShowTrade] = useState(true);

  const selected = eras.find((e) => e.id === selectedId) || eras[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">Interactive Ancient Atlas & Timeline</h3>
          <p className="text-xs text-slate-500">Click any civilization on the map or timeline to trace cause and effect</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRivers(!showRivers)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              showRivers ? 'bg-sky-50 border-sky-300 text-sky-800' : 'bg-white border-slate-200 text-slate-600'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Rivers {showRivers ? 'On' : 'Off'}
          </button>
          <button
            type="button"
            onClick={() => setShowTrade(!showTrade)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              showTrade ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-600'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            Trade Routes {showTrade ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {/* Interactive SVG Atlas */}
      <div className="bg-[#FAF7F0] border border-slate-200 rounded-xl p-4">
        <svg viewBox="0 0 420 190" className="w-full h-48">
          {/* Stylized Landmasses */}
          <path d="M 30 40 L 155 45 L 175 155 L 40 165 Z" fill="#EFE7D6" stroke="#D6CCB8" />
          <path d="M 165 40 L 255 38 L 265 145 L 180 140 Z" fill="#EFE7D6" stroke="#D6CCB8" />
          <path d="M 265 55 L 380 50 L 365 168 L 275 158 Z" fill="#EFE7D6" stroke="#D6CCB8" />

          {/* Rivers Layer */}
          {showRivers && (
            <g stroke="#0EA5E9" strokeWidth="3" fill="none" strokeLinecap="round">
              <path d="M 120 160 Q 128 115 118 65" />
              <path d="M 188 60 Q 205 100 225 135" />
              <path d="M 310 65 Q 295 110 290 155" />
            </g>
          )}

          {/* Trade Routes Layer */}
          {showTrade && (
            <g stroke="#D97706" strokeWidth="2" strokeDasharray="5 4" fill="none">
              <path d="M 120 112 Q 160 85 195 95" />
              <path d="M 195 95 Q 245 128 295 120" />
            </g>
          )}

          {/* Civilization Nodes */}
          {eras.map((era) => {
            const active = era.id === selectedId;
            return (
              <g key={era.id} onClick={() => setSelectedId(era.id)} className="cursor-pointer">
                <circle
                  cx={era.x}
                  cy={era.y}
                  r={active ? 15 : 10}
                  fill={active ? '#4F46E5' : '#FFFFFF'}
                  stroke="#4F46E5"
                  strokeWidth="2.5"
                />
                <text
                  x={era.x}
                  y={era.y - 18}
                  textAnchor="middle"
                  className="fill-slate-900 text-[11px] font-bold"
                >
                  {era.name}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Timeline Selector */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-200/80">
          {eras.map((era) => (
            <button
              key={era.id}
              type="button"
              onClick={() => setSelectedId(era.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                era.id === selectedId
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="font-mono">{era.era}</span> · {era.name}
            </button>
          ))}
        </div>
      </div>

      {/* Cause & Effect Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white border border-slate-200 rounded-xl p-4 text-xs">
        <div>
          <div className="font-bold text-sky-700 mb-1">CAUSE ({selected.river})</div>
          <p className="text-slate-700 leading-relaxed">{selected.cause}</p>
        </div>
        <div>
          <div className="font-bold text-indigo-700 mb-1">EFFECT (Civilization Growth)</div>
          <p className="text-slate-700 leading-relaxed">{selected.effect}</p>
        </div>
      </div>
    </div>
  );
};

/* ---------------- 5. COMPUTING: CPU CYCLE & IF/ELSE LOGIC LAB ---------------- */
const ComputingVisualStage: React.FC = () => {
  const steps = [
    {
      title: '1. Load from Storage to RAM',
      detail: 'The saved textbook file moves from slow SSD Storage into fast RAM working memory.',
      active: 'storage_ram',
    },
    {
      title: '2. Fetch Instruction',
      detail: 'The CPU fetches the next instruction ("ADD 3 + 4") from RAM across the data bus.',
      active: 'fetch',
    },
    {
      title: '3. Decode & Execute',
      detail: 'The CPU Control Unit decodes "ADD", and the ALU calculates 3 + 4 = 7.',
      active: 'execute',
    },
    {
      title: '4. Store & Output',
      detail: 'The answer 7 is saved back to RAM and drawn on your screen.',
      active: 'output',
    },
  ];

  const [stepIdx, setStepIdx] = useState(0);
  const [inputScore, setInputScore] = useState(8);
  const [bonusDone, setBonusDone] = useState(true);

  const conditionPasses = inputScore >= 7 || bonusDone;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <h3 className="text-base font-bold text-slate-900">CPU Cycle & Flowchart Logic Simulator</h3>
          <p className="text-xs text-slate-500">
            Step through how hardware executes instructions and test an IF / ELSE decision branch
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStepIdx((prev) => (prev + 1) % steps.length)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 transition-colors"
          >
            Next Cycle Step <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setStepIdx(0)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
        </div>
      </div>

      {/* Hardware Architecture Flow */}
      <div className="bg-slate-900 text-white rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center text-xs">
          <div
            className={`p-3 rounded-lg border transition-colors ${
              stepIdx === 2 || stepIdx === 1
                ? 'bg-teal-500/20 border-teal-400 text-teal-100'
                : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            <Cpu className="w-5 h-5 mx-auto mb-1 text-teal-400" />
            <div className="font-bold">CPU</div>
            <div className="text-[11px] text-slate-400">Decode & Execute</div>
          </div>
          <div
            className={`p-3 rounded-lg border transition-colors ${
              stepIdx === 0 || stepIdx === 1 || stepIdx === 3
                ? 'bg-sky-500/20 border-sky-400 text-sky-100'
                : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            <div className="font-mono font-bold text-sm mb-1 text-sky-400">RAM</div>
            <div className="font-bold">Fast Memory</div>
            <div className="text-[11px] text-slate-400">Temporary Desk</div>
          </div>
          <div
            className={`p-3 rounded-lg border transition-colors ${
              stepIdx === 0
                ? 'bg-amber-500/20 border-amber-400 text-amber-100'
                : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            <div className="font-mono font-bold text-sm mb-1 text-amber-400">SSD</div>
            <div className="font-bold">Storage</div>
            <div className="text-[11px] text-slate-400">Permanent Files</div>
          </div>
        </div>
        <div className="p-3 bg-slate-800/80 border border-slate-700 rounded-lg text-xs">
          <div className="font-bold text-teal-300">{steps[stepIdx].title}</div>
          <div className="text-slate-200 mt-1">{steps[stepIdx].detail}</div>
        </div>
      </div>

      {/* IF / ELSE Flowchart Tester */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="text-xs font-bold text-slate-900">
          Interactive Flowchart Rule: IF (Quiz Score ≥ 7 OR Bonus Practice Done) → Unlock Next Level
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          <div className="space-y-2.5 text-xs">
            <label className="block">
              <div className="flex justify-between mb-1">
                <span>Quiz Score</span>
                <span className="font-mono tabular-nums font-bold">{inputScore} / 10</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                value={inputScore}
                onChange={(e) => setInputScore(Number(e.target.value))}
                className="w-full accent-teal-600"
              />
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={bonusDone}
                onChange={(e) => setBonusDone(e.target.checked)}
                className="accent-teal-600 w-4 h-4"
              />
              <span>Bonus Practice Completed ({bonusDone ? 'TRUE' : 'FALSE'})</span>
            </label>
          </div>
          <div
            className={`p-3.5 rounded-lg border text-xs font-medium ${
              conditionPasses
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            <div className="font-mono font-bold mb-1">
              Condition Evaluates To: {conditionPasses ? 'TRUE' : 'FALSE'}
            </div>
            <div>
              {conditionPasses
                ? 'Branch Taken → Level Unlocked! Student advances to Challenge Stage.'
                : 'Branch Taken → Review Visual Hint first before advancing.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
