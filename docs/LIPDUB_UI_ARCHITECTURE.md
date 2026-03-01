# LipDub Clone - UI/UX Component Architecture
## Mexico Video Localization MVP

---

## 🎨 Design System Analysis (from Screenshot)

### Color Palette
| Token | HEX | Usage |
|-------|-----|-------|
| `--bg-primary` | `#0D0D0F` | Main background |
| `--bg-secondary` | `#1A1A1F` | Cards, sidebar |
| `--bg-elevated` | `#25252B` | Inputs, table rows |
| `--accent-primary` | `#E040FB` | Primary buttons, highlights |
| `--accent-secondary` | `#B027F7` | Gradients, hover states |
| `--text-primary` | `#FFFFFF` | Headings, primary text |
| `--text-secondary` | `#9CA3AF` | Secondary text, labels |
| `--text-muted` | `#6B7280` | Placeholder, disabled |
| `--border` | `#2D2D35` | Borders, dividers |
| `--success` | `#10B981` | Success states |
| `--warning` | `#F59E0B` | Warnings, trial badge |

### Typography
- **Headings**: Inter/SF Pro Display, 600 weight
- **Body**: Inter, 400 weight
- **Labels**: Inter, 500 weight, uppercase tracking

---

## 🧩 Component Inventory

### 1. LAYOUT COMPONENTS

#### Sidebar Navigation
```tsx
interface SidebarProps {
  activeItem: 'translate' | 'personalize' | 'projects' | 'subscription';
  onNavigate: (item: string) => void;
}

// Items:
// - Translate a video (icon: language/translate)
// - Personalize a video (icon: wand/sparkles)
// - Projects (icon: folder) - ACTIVE STATE
// - Subscription (icon: credit-card)
```

#### Top Header
```tsx
interface HeaderProps {
  credits: number;
  trialDaysRemaining: number;
  onAddCredits: () => void;
  userAvatar?: string;
}

// Components:
// - Logo (LIPDUB AI with gradient text)
// - Home link
// - Help icon (circle with ?)
// - Credits badge (+ 20.00 credits)
// - Trial badge (pink pill: 14 days remaining)
// - User avatar
```

---

### 2. PROJECT PAGE COMPONENTS

#### Tutorial Banner
```tsx
interface TutorialBannerProps {
  title: string;
  subtitle: string;
  videoThumbnail: string;
  onPlay: () => void;
}

// Layout:
// - Full width card
// - Purple gradient background (linear-gradient to right)
// - Left: Subtitle (VIDEO TUTORIALS), Title (5 Checks before you Upload)
// - Right: Video thumbnail with play button overlay
// - Rounded corners (12px)
```

#### Project List Header
```tsx
interface ProjectListHeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCreateProject: () => void;
}

// Layout:
// - "My Projects" title (left)
// - Search input with icon (center)
// - "Create Project" button (right, pink/purple)
```

#### Search Input
```tsx
interface SearchInputProps {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

// Style:
// - Dark background (#25252B)
// - Search icon left
// - Placeholder: "Search for a project"
// - Rounded (8px)
// - Full width in container
```

#### Create Project Button
```tsx
interface CreateProjectButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

// Style:
// - Pink/purple gradient background
// - Plus icon (+)
// - Text: "Create Project"
// - Rounded (8px)
// - Hover: slightly lighter gradient
```

#### Projects Table
```tsx
interface ProjectsTableProps {
  projects: Project[];
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  onSort: (column: string) => void;
}

interface Project {
  id: string;
  name: string;
  type: 'single-actor' | 'multi-actor' | 'personalized';
  createdBy: string;
  sourceLanguage: string;
  createdAt: string;
  updatedAt: string;
  thumbnail?: string;
}

// Columns:
// - Project Name (sortable)
// - Project Type (sortable)
// - Created By (sortable)
// - Source Language (sortable)
// - Created At (sortable)
// - Updated At (sortable)

// Row Style:
// - Dark background (#1A1A1F)
// - Bottom border
// - Hover: slightly lighter
```

#### Project Row
```tsx
interface ProjectRowProps {
  project: Project;
  onClick: () => void;
}

// Layout:
// - Project name (bold, white)
// - Type badge (Single Actor, Multi Actor, etc.)
// - Created by (email truncated)
// - Source language (pill/badge)
// - Created date (MM-DD-YY format)
// - Updated date (MM-DD-YY format)
```

#### Pagination
```tsx
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

// Layout:
// - << (first)
// - < (previous)
// - Page number buttons (current: purple bg)
// - > (next)
// - >> (last)
// - Centered below table
```

---

### 3. CREATE PROJECT FLOW COMPONENTS

#### Step 1: Upload Video
```tsx
interface UploadVideoStepProps {
  onUpload: (file: File) => void;
  isUploading: boolean;
  progress: number;
}

// Layout:
// - Large dashed border drop zone
// - Upload icon (cloud/arrow)
// - Text: "Drop video here or click to upload"
// - Subtext: "Supported: MP4, MOV | Up to 4K | Max 500MB"
// - File picker on click
```

#### Step 2: Configure Translation
```tsx
interface TranslationConfigProps {
  sourceLanguage: string;
  targetLanguage: string;
  voiceOption: 'ai-library' | 'clone' | 'tts';
  onSourceChange: (lang: string) => void;
  onTargetChange: (lang: string) => void;
  onVoiceChange: (option: string) => void;
}

// Options:
// Source: [Español (México) ▼]
// Target: [English (US) ▼]
// Voice:
//   ( ) AI Voice Library
//   ( ) Clone Original Voice
//   ( ) Text-to-Speech
```

#### Step 3: Speaker Detection
```tsx
interface SpeakerDetectionProps {
  speakers: Speaker[];
  onEditSpeaker: (id: string) => void;
}

interface Speaker {
  id: string;
  name: string;
  timeRange: string;
  thumbnail: string;
}

// Shows: "[2] speakers detected" with [Review/Edit] button
```

#### Step 4: Advanced Options
```tsx
interface AdvancedOptionsProps {
  sideProfile: boolean;
  highFidelity: boolean;
  preserveAudio: boolean;
  onToggle: (option: string) => void;
}

// Checkboxes:
// [ ] Side profile mode
// [ ] High fidelity (slower)
// [ ] Preserve background audio
```

#### Step 5: Submit
```tsx
interface SubmitStepProps {
  estimatedCredits: number;
  onSubmit: () => void;
  onCancel: () => void;
}

// Buttons:
// [Cancel] [Start Dubbing - 12 cr]
```

---

### 4. STATUS COMPONENTS

#### Processing Status Badge
```tsx
interface StatusBadgeProps {
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
}

// States:
// - Queued: Gray pill
// - Processing: Purple pill with spinner
// - Completed: Green checkmark
// - Failed: Red X with retry button
```

#### Credit Display
```tsx
interface CreditDisplayProps {
  amount: number;
  onAdd: () => void;
}

// Style:
// - Dark pill with + icon
// - Text: "20.00 credits"
// - Click to add more
```

#### Trial Badge
```tsx
interface TrialBadgeProps {
  daysRemaining: number;
}

// Style:
// - Pink/magenta pill
// - Text: "14 days remaining"
```

---

### 5. MODAL COMPONENTS

#### Create Project Modal
```tsx
interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  step: 'upload' | 'configure' | 'processing' | 'complete';
}

// Multi-step wizard
// Progress indicator at top
// Step content in center
// Navigation buttons at bottom
```

#### Video Preview Modal
```tsx
interface VideoPreviewModalProps {
  videoUrl: string;
  onDownload: () => void;
  onShare: () => void;
  onClose: () => void;
}

// Video player
// Download button
// Share button
// Close X
```

---

## 📁 File Structure

```
app/
├── layout.tsx                 # Root layout with sidebar
├── page.tsx                   # Projects page (default)
├── translate/
│   └── page.tsx              # Translate video flow
├── personalize/
│   └── page.tsx              # Personalize video flow
├── subscription/
│   └── page.tsx              # Subscription/credits page
├── api/
│   └── lipdub/
│       ├── projects/route.ts
│       ├── upload/route.ts
│       ├── voices/route.ts
│       └── credits/route.ts
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── Layout.tsx
│   ├── projects/
│   │   ├── TutorialBanner.tsx
│   │   ├── ProjectList.tsx
│   │   ├── ProjectRow.tsx
│   │   ├── ProjectsTable.tsx
│   │   └── SearchInput.tsx
│   ├── create-project/
│   │   ├── UploadStep.tsx
│   │   ├── ConfigureStep.tsx
│   │   ├── SpeakersStep.tsx
│   │   ├── AdvancedStep.tsx
│   │   └── SubmitStep.tsx
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   ├── Badge.tsx
│   │   ├── ProgressBar.tsx
│   │   └── Modal.tsx
│   └── shared/
│       ├── CreditDisplay.tsx
│       ├── TrialBadge.tsx
│       └── StatusBadge.tsx
├── hooks/
│   ├── useProjects.ts
│   ├── useUpload.ts
│   └── useCredits.ts
├── lib/
│   ├── lipdub-api.ts
│   └── utils.ts
└── styles/
    └── globals.css
```

---

## 🔌 API Integration (Inferred)

```typescript
// lib/lipdub-api.ts

const API_BASE = 'https://app.lipdub.ai/api/v1';

class LipDubAPI {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request(endpoint: string, options?: RequestInit) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    return response.json();
  }

  // Projects
  async getProjects() {
    return this.request('/projects');
  }

  async getProject(id: string) {
    return this.request(`/projects/${id}`);
  }

  async createProject(data: CreateProjectData) {
    return this.request('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Credits
  async getCredits() {
    return this.request('/credits');
  }

  // Voices
  async getVoices() {
    return this.request('/voices');
  }

  // Upload
  async uploadVideo(file: File, onProgress?: (progress: number) => void) {
    const formData = new FormData();
    formData.append('video', file);
    
    return fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: { 'Authorization': this.apiKey },
      body: formData,
    });
  }
}

export const lipdubApi = new LipDubAPI(process.env.NEXT_PUBLIC_LIPDUB_API_KEY!);
```

---

## 🎯 MVP Scope

### Phase 1: Projects Dashboard
- [ ] Sidebar navigation
- [ ] Header with credits/trial
- [ ] Tutorial banner
- [ ] Projects list with search
- [ ] Create project button
- [ ] Pagination

### Phase 2: Create Project Flow
- [ ] Upload video step
- [ ] Configure translation
- [ ] Review & submit
- [ ] Processing status
- [ ] Download result

### Phase 3: Video Playback
- [ ] Video player
- [ ] Download functionality
- [ ] Share links

---

## 🚀 Implementation Priority

1. **Layout components** (Sidebar, Header)
2. **Projects list** (table, search, pagination)
3. **Create project modal** (upload step)
4. **Configure translation** (language selection)
5. **Processing status** (polling for updates)
6. **Video download** (preview & download)

---

Ready to build? Start with Layout + Projects page?
