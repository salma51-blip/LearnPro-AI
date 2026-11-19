const STARTER_SVGS: Record<string, string> = {
  'equivalent fractions & addition': `<svg viewBox="0 0 680 380" xmlns="http://www.w3.org/2000/svg">
  <rect width="680" height="380" rx="16" fill="#F8FAFC"/>
  <text x="340" y="34" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="800" fill="#0F172A">Equivalent Fractions &amp; Common Denominators: 1/2 + 1/4 = 3/4</text>
  <text x="48" y="84" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#0369A1">1/2 Pizza</text>
  <rect x="48" y="96" width="260" height="52" rx="8" fill="#E2E8F0" stroke="#94A3B8" stroke-width="2"/>
  <rect x="48" y="96" width="130" height="52" rx="8" fill="#0284C7">
    <animate attributeName="opacity" values="0.82;1;0.82" dur="2.6s" repeatCount="indefinite"/>
  </rect>
  <line x1="178" y1="96" x2="178" y2="148" stroke="#FFFFFF" stroke-width="3"/>
  <text x="113" y="128" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" font-weight="800" fill="#FFFFFF">1/2 = 2/4</text>

  <text x="372" y="84" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#047857">1/4 Pizza</text>
  <rect x="372" y="96" width="260" height="52" rx="8" fill="#E2E8F0" stroke="#94A3B8" stroke-width="2"/>
  <rect x="372" y="96" width="65" height="52" rx="8" fill="#059669">
    <animate attributeName="opacity" values="0.82;1;0.82" dur="2.6s" begin="0.6s" repeatCount="indefinite"/>
  </rect>
  <line x1="437" y1="96" x2="437" y2="148" stroke="#FFFFFF" stroke-width="2"/>
  <line x1="502" y1="96" x2="502" y2="148" stroke="#CBD5E1" stroke-width="2"/>
  <line x1="567" y1="96" x2="567" y2="148" stroke="#CBD5E1" stroke-width="2"/>
  <text x="404" y="128" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" font-weight="800" fill="#FFFFFF">1/4</text>

  <path d="M 178 160 L 290 218" stroke="#0284C7" stroke-width="3" stroke-dasharray="6 4" fill="none"/>
  <path d="M 437 160 L 390 218" stroke="#059669" stroke-width="3" stroke-dasharray="6 4" fill="none"/>
  <circle r="5" fill="#0284C7"><animateMotion dur="2.2s" repeatCount="indefinite" path="M 178 160 L 290 218"/></circle>
  <circle r="5" fill="#059669"><animateMotion dur="2.2s" repeatCount="indefinite" path="M 437 160 L 390 218"/></circle>

  <text x="340" y="210" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" font-weight="800" fill="#0F172A">Equal-Sized Slices Combined (4ths)</text>
  <rect x="90" y="226" width="500" height="64" rx="10" fill="#E2E8F0" stroke="#64748B" stroke-width="2"/>
  <rect x="90" y="226" width="250" height="64" rx="10" fill="#0284C7"/>
  <rect x="340" y="226" width="125" height="64" fill="#059669">
    <animate attributeName="width" values="0;125;125" dur="3s" repeatCount="indefinite"/>
  </rect>
  <line x1="215" y1="226" x2="215" y2="290" stroke="#FFFFFF" stroke-width="3"/>
  <line x1="340" y1="226" x2="340" y2="290" stroke="#FFFFFF" stroke-width="3"/>
  <line x1="465" y1="226" x2="465" y2="290" stroke="#CBD5E1" stroke-width="3"/>
  <text x="215" y="264" text-anchor="middle" font-family="system-ui, sans-serif" font-size="15" font-weight="800" fill="#FFFFFF">2/4 (from 1/2)</text>
  <text x="402" y="264" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" font-weight="800" fill="#FFFFFF">+ 1/4</text>
  <rect x="190" y="312" width="300" height="40" rx="20" fill="#0F172A"/>
  <text x="340" y="337" text-anchor="middle" font-family="system-ui, sans-serif" font-size="15" font-weight="800" fill="#38BDF8">Total = 3/4 (Three Equal Quarters)</text>
</svg>`,

  'simple electric circuits': `<svg viewBox="0 0 680 380" xmlns="http://www.w3.org/2000/svg">
  <rect width="680" height="380" rx="16" fill="#0F172A"/>
  <text x="340" y="36" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="800" fill="#F8FAFC">Closed Electric Circuit: Continuous Electron Flow</text>
  <rect x="110" y="75" width="460" height="225" rx="22" fill="none" stroke="#38BDF8" stroke-width="6"/>
  <!-- Flowing electrons -->
  <circle r="7" fill="#FDE047"><animateMotion dur="3.4s" repeatCount="indefinite" path="M 110 97 L 570 97 L 570 300 L 110 300 Z"/></circle>
  <circle r="7" fill="#FDE047"><animateMotion dur="3.4s" begin="-1.1s" repeatCount="indefinite" path="M 110 97 L 570 97 L 570 300 L 110 300 Z"/></circle>
  <circle r="7" fill="#FDE047"><animateMotion dur="3.4s" begin="-2.2s" repeatCount="indefinite" path="M 110 97 L 570 97 L 570 300 L 110 300 Z"/></circle>
  <!-- Battery -->
  <rect x="64" y="135" width="92" height="106" rx="12" fill="#1E293B" stroke="#38BDF8" stroke-width="3"/>
  <rect x="92" y="124" width="36" height="12" rx="4" fill="#F59E0B"/>
  <text x="110" y="182" text-anchor="middle" font-family="system-ui, sans-serif" font-size="18" font-weight="800" fill="#38BDF8">6V</text>
  <text x="110" y="204" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#CBD5E1">CELL / BATTERY</text>
  <text x="110" y="222" text-anchor="middle" font-family="system-ui, sans-serif" font-size="10" fill="#94A3B8">Pushes charges</text>
  <!-- Closed Switch at top -->
  <rect x="260" y="54" width="160" height="42" rx="10" fill="#064E3B" stroke="#34D399" stroke-width="2.5"/>
  <text x="340" y="80" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" font-weight="800" fill="#6EE7B7">CLOSED SWITCH</text>
  <!-- Glowing Bulb on right -->
  <circle cx="570" cy="188" r="54" fill="#FACC15" opacity="0.22">
    <animate attributeName="r" values="48;62;48" dur="1.8s" repeatCount="indefinite"/>
  </circle>
  <circle cx="570" cy="188" r="36" fill="#FDE047" stroke="#FEF08A" stroke-width="3"/>
  <text x="570" y="193" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" font-weight="800" fill="#0F172A">LIGHT</text>
  <text x="570" y="246" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#FDE047">Energy → Light</text>
  <!-- Bottom summary -->
  <rect x="190" y="324" width="300" height="36" rx="18" fill="#1E293B" stroke="#475569"/>
  <text x="340" y="347" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#E2E8F0">No gap in loop = Bulb shines brightly!</text>
</svg>`,

  'sentence building blocks': `<svg viewBox="0 0 680 380" xmlns="http://www.w3.org/2000/svg">
  <rect width="680" height="380" rx="16" fill="#F8FAFC"/>
  <text x="340" y="36" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="800" fill="#0F172A">Sentence Building Blocks: Turning Words into a Clear Picture</text>
  <!-- 4 animated blocks snapping into sentence -->
  <g>
    <rect x="36" y="78" width="144" height="92" rx="12" fill="#FEF3C7" stroke="#D97706" stroke-width="2.5"/>
    <text x="108" y="106" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="800" fill="#B45309">ADJECTIVE</text>
    <text x="108" y="132" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="800" fill="#0F172A">curious</text>
    <text x="108" y="154" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#78350F">Adds mood</text>
  </g>
  <g>
    <rect x="194" y="78" width="144" height="92" rx="12" fill="#E0F2FE" stroke="#0284C7" stroke-width="2.5"/>
    <text x="266" y="106" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="800" fill="#0369A1">SUBJECT (WHO)</text>
    <text x="266" y="132" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="800" fill="#0F172A">The fox</text>
    <text x="266" y="154" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#0C4A6E">Who acts</text>
  </g>
  <g>
    <rect x="352" y="78" width="144" height="92" rx="12" fill="#D1FAE5" stroke="#059669" stroke-width="2.5"/>
    <text x="424" y="106" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="800" fill="#047857">VERB (ACTION)</text>
    <text x="424" y="132" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="800" fill="#0F172A">leaped</text>
    <text x="424" y="154" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#065F46">Shows motion</text>
  </g>
  <g>
    <rect x="510" y="78" width="136" height="92" rx="12" fill="#E0E7FF" stroke="#4F46E5" stroke-width="2.5"/>
    <text x="578" y="106" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="800" fill="#4338CA">WHERE?</text>
    <text x="578" y="132" text-anchor="middle" font-family="system-ui, sans-serif" font-size="14" font-weight="800" fill="#0F172A">over the log</text>
    <text x="578" y="154" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#312E81">Sets the scene</text>
  </g>
  <!-- Flowing highlight dot -->
  <path d="M 108 184 L 578 184" stroke="#CBD5E1" stroke-width="4" stroke-linecap="round"/>
  <circle r="7" fill="#0284C7"><animateMotion dur="3.5s" repeatCount="indefinite" path="M 108 184 L 578 184"/></circle>
  <!-- Final mental picture box -->
  <rect x="56" y="218" width="568" height="120" rx="16" fill="#0F172A"/>
  <text x="340" y="254" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#38BDF8">MENTAL PICTURE SENTENCE</text>
  <text x="340" y="292" text-anchor="middle" font-family="system-ui, sans-serif" font-size="20" font-weight="800" fill="#FFFFFF">"The curious fox leaped over the mossy log."</text>
  <text x="340" y="320" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" fill="#94A3B8">Every block answers a clear question in your mind!</text>
</svg>`,

  'river valley civilizations': `<svg viewBox="0 0 680 380" xmlns="http://www.w3.org/2000/svg">
  <rect width="680" height="380" rx="16" fill="#FAF7F0"/>
  <text x="340" y="34" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="800" fill="#0F172A">Why Ancient Cities Grew Beside Great Rivers</text>
  <!-- Winding river -->
  <path d="M 40 240 Q 190 175 340 235 T 640 215" fill="none" stroke="#0EA5E9" stroke-width="34" stroke-linecap="round"/>
  <path d="M 40 240 Q 190 175 340 235 T 640 215" fill="none" stroke="#BAE6FD" stroke-width="6" stroke-dasharray="16 14" stroke-linecap="round">
    <animate attributeName="stroke-dashoffset" from="60" to="0" dur="2.5s" repeatCount="indefinite"/>
  </path>
  <!-- Boat traveling on river -->
  <g>
    <polygon points="-14,0 14,0 9,9 -9,9" fill="#92400E"/>
    <polygon points="0,-16 0,-2 10,-4" fill="#FFFFFF"/>
    <animateMotion dur="6s" repeatCount="indefinite" path="M 70 234 Q 205 178 340 235 T 600 220"/>
  </g>
  <!-- 3 Cause & Effect Cards -->
  <rect x="44" y="64" width="184" height="86" rx="12" fill="#FFFFFF" stroke="#0284C7" stroke-width="2"/>
  <text x="136" y="88" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="800" fill="#0369A1">1. ANNUAL FLOODS</text>
  <text x="136" y="109" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#334155">Left dark fertile silt</text>
  <text x="136" y="126" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#334155">along riverbanks</text>

  <rect x="248" y="64" width="184" height="86" rx="12" fill="#FFFFFF" stroke="#059669" stroke-width="2"/>
  <text x="340" y="88" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="800" fill="#047857">2. FOOD SURPLUS</text>
  <text x="340" y="109" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#334155">Irrigation canals grew</text>
  <text x="340" y="126" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#334155">extra wheat &amp; barley</text>

  <rect x="452" y="64" width="184" height="86" rx="12" fill="#FFFFFF" stroke="#4F46E5" stroke-width="2"/>
  <text x="544" y="88" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="800" fill="#4338CA">3. CITIES &amp; TRADE</text>
  <text x="544" y="109" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#334155">Builders, scribes &amp;</text>
  <text x="544" y="126" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#334155">river boat trade routes</text>

  <!-- Crops & City markers -->
  <rect x="85" y="286" width="510" height="62" rx="12" fill="#FEF3C7" stroke="#D97706" stroke-width="2"/>
  <text x="340" y="313" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" font-weight="800" fill="#92400E">Nile (Egypt) · Tigris &amp; Euphrates (Mesopotamia) · Indus Valley</text>
  <text x="340" y="334" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#78350F">River Water + Fertile Silt → Farming Surplus → First Great Cities</text>
</svg>`,

  'cpu & ram cycle': `<svg viewBox="0 0 680 380" xmlns="http://www.w3.org/2000/svg">
  <rect width="680" height="380" rx="16" fill="#0F172A"/>
  <text x="340" y="34" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="800" fill="#F8FAFC">Inside the Computer: Storage → RAM → CPU Cycle</text>
  <!-- Data Bus Paths -->
  <path d="M 180 170 L 265 170" stroke="#38BDF8" stroke-width="4"/>
  <path d="M 415 170 L 500 170" stroke="#14B8A6" stroke-width="4"/>
  <circle r="6" fill="#FACC15"><animateMotion dur="2s" repeatCount="indefinite" path="M 180 170 L 265 170"/></circle>
  <circle r="6" fill="#2DD4BF"><animateMotion dur="2s" begin="0.7s" repeatCount="indefinite" path="M 415 170 L 500 170"/></circle>
  <!-- SSD Box -->
  <rect x="44" y="106" width="136" height="128" rx="14" fill="#1E293B" stroke="#F59E0B" stroke-width="2.5"/>
  <text x="112" y="142" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="800" fill="#FBBF24">SSD</text>
  <text x="112" y="164" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#F8FAFC">Permanent</text>
  <text x="112" y="182" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#F8FAFC">Storage</text>
  <text x="112" y="210" text-anchor="middle" font-family="system-ui, sans-serif" font-size="10" fill="#94A3B8">Bookshelf</text>
  <!-- RAM Box -->
  <rect x="265" y="106" width="150" height="128" rx="14" fill="#1E293B" stroke="#0EA5E9" stroke-width="2.5"/>
  <text x="340" y="142" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="800" fill="#38BDF8">RAM</text>
  <text x="340" y="164" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#F8FAFC">Fast Working</text>
  <text x="340" y="182" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#F8FAFC">Memory</text>
  <text x="340" y="210" text-anchor="middle" font-family="system-ui, sans-serif" font-size="10" fill="#94A3B8">Open Desk</text>
  <!-- CPU Box -->
  <rect x="500" y="106" width="136" height="128" rx="14" fill="#134E4A" stroke="#2DD4BF" stroke-width="3">
    <animate attributeName="stroke-opacity" values="0.6;1;0.6" dur="1.8s" repeatCount="indefinite"/>
  </rect>
  <text x="568" y="142" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="800" fill="#5EEAD4">CPU</text>
  <text x="568" y="164" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#FFFFFF">1. Fetch</text>
  <text x="568" y="182" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#FFFFFF">2. Decode</text>
  <text x="568" y="200" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="700" fill="#FFFFFF">3. Execute</text>
  <!-- Cycle Footer -->
  <rect x="90" y="282" width="500" height="58" rx="12" fill="#1E293B" stroke="#334155"/>
  <text x="340" y="307" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" font-weight="800" fill="#5EEAD4">Fetch → Decode → Execute Cycle</text>
  <text x="340" y="327" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" fill="#CBD5E1">Apps load from SSD into RAM so the CPU can calculate instructions fast!</text>
</svg>`,
};

export function getStarterAnimatedSvg(topicTitle: string): string | null {
  const key = topicTitle.trim().toLowerCase();
  return STARTER_SVGS[key] || null;
}
