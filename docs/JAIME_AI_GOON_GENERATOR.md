# Jaime AI Goon Generator
## Video Personalization Platform for Mexico

**Project:** Jaime AI Goon Generator  
**Type:** AI-Powered Video Personalization & Localization  
**Market:** Mexico (Spanish/English)  
**Tech Stack:** Next.js 14, Tailwind CSS, Node.js

---

## 🎯 Project Overview

Jaime AI Goon Generator is a video personalization platform that allows users to:
1. **Upload** a base video
2. **Add variables** (dynamic placeholders like {{first_name}}, {{company}})
3. **Upload recipient data** (CSV with variable values)
4. **Generate** bulk personalized videos with AI lip-sync

**Key Differentiators for Mexico:**
- Mexican Spanish accent support (not just generic Spanish)
- Local dialect variations
- Affordable pricing for LATAM market
- Fast turnaround for creators

---

## 🎨 UI/UX Component Architecture

### 1. LAYOUT COMPONENTS

#### Sidebar Navigation
```tsx
// components/layout/Sidebar.tsx
interface NavItem {
  id: 'translate' | 'personalize' | 'projects' | 'subscription';
  label: string;
  icon: React.ReactNode;
  href: string;
}

const navItems: NavItem[] = [
  { id: 'personalize', label: 'Personalize a video', icon: <Wand2 />, href: '/personalize' },
  { id: 'projects', label: 'Projects', icon: <Folder />, href: '/projects' },
  { id: 'subscription', label: 'Subscription', icon: <CreditCard />, href: '/subscription' },
];

// Active state: Purple left border + lighter background
// Inactive: Dark background with subtle hover
```

#### Top Header
```tsx
// components/layout/Header.tsx
interface HeaderProps {
  credits: number;
  trialDaysRemaining: number;
  user: { name: string; avatar?: string };
}

// Left: Logo "JAIME AI" (gradient text: pink to purple)
// Center: Breadcrumb navigation
// Right: 
//   - Help icon (?)
//   - Credits badge (+ 20.00 credits)
//   - Trial badge (14 days remaining - pink pill)
//   - User avatar
```

---

### 2. PERSONALIZE VIDEO FLOW (4-Step Wizard)

#### Step Progress Bar
```tsx
// components/personalize/StepProgress.tsx
interface Step {
  number: number;
  label: string;
  icon: React.ReactNode;
  status: 'active' | 'completed' | 'pending';
}

const steps = [
  { number: 1, label: 'Upload Video', icon: <Upload /> },
  { number: 2, label: 'Add Variables', icon: <Pencil /> },
  { number: 3, label: 'Upload Recipients', icon: <Database /> },
  { number: 4, label: 'Generate Results', icon: <Video /> },
];

// Visual: Horizontal line connecting steps
// Active: Purple circle with icon
// Completed: Purple checkmark
// Pending: Gray circle
```

---

#### STEP 1: Upload Video
```tsx
// components/personalize/UploadStep.tsx
interface UploadStepProps {
  onUpload: (file: File) => void;
  isUploading: boolean;
  uploadProgress: number;
}

// Layout:
┌─────────────────────────────────────────────────────────────────┐
│  Upload Your Video                                              │
│  Upload a video file to start the personalization process.      │
│  We'll automatically generate a transcript.                     │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │              [Cloud Upload Icon]                          │ │
│  │                                                           │ │
│  │     Drop your video file here or click to browse          │ │
│  │                                                           │ │
│  │              [Choose file]                                │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Supported: MP4, MOV | Max 500MB | Up to 4K resolution         │
└─────────────────────────────────────────────────────────────────┘

// Style:
// - Dashed border box (dark background #25252B)
// - Border: dashed, subtle gray
// - Hover: border turns purple
// - Upload icon: Large, centered
// - Button: Dark gray bg, white text
```

---

#### STEP 2: Add Variables
```tsx
// components/personalize/VariablesStep.tsx
interface Variable {
  id: string;
  name: string;        // e.g., "first_name"
  displayName: string; // e.g., "First Name"
  type: 'text' | 'company' | 'industry' | 'custom';
  preview?: string;    // e.g., "John"
}

interface VariablesStepProps {
  transcript: string;  // Auto-generated from video
  variables: Variable[];
  onAddVariable: (variable: Variable) => void;
  onRemoveVariable: (id: string) => void;
  onUpdateTranscript: (text: string) => void;
}

// Layout:
┌─────────────────────────────────────────────────────────────────┐
│  Add Variables                                                  │
│  Select words in your transcript to make them dynamic.          │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  TRANSCRIPT                                               │ │
│  │  ───────────────────────────────────────────────────────  │ │
│  │                                                           │ │
│  │  "Hey {{first_name}}, welcome to {{company}}! We're      │ │
│  │   excited to help you grow in the {{industry}} space."   │ │
│  │                                                           │ │
│  │   [Words are clickable to convert to variables]           │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  YOUR VARIABLES:                                                │
│  ┌──────────────┬──────────────┬──────────────┐                │
│  │ {{first_name}}│ {{company}}  │ {{industry}} │                │
│  │ Type: Text   │ Type: Company│ Type: Custom │                │
│  │ [Preview:   │ [Preview:    │ [Preview:    │                │
│  │  "John"]    │  "Acme Inc"] │  "SaaS"]     │                │
│  └──────────────┴──────────────┴──────────────┘                │
│                                                                 │
│  [Add Custom Variable]                                          │
└─────────────────────────────────────────────────────────────────┘

// Features:
// - Click any word in transcript → Convert to {{variable}}
// - Variable cards show type and preview
// - Types: Text, Company, Industry, Custom
// - Each variable can be edited or removed
```

---

#### STEP 3: Upload Recipients
```tsx
// components/personalize/RecipientsStep.tsx
interface Recipient {
  id: string;
  first_name: string;
  company: string;
  industry?: string;
  email: string;  // For delivery
  [key: string]: string;
}

interface RecipientsStepProps {
  variables: Variable[];
  recipients: Recipient[];
  onUploadCSV: (file: File) => void;
  onManualAdd: (recipient: Recipient) => void;
  onRemoveRecipient: (id: string) => void;
}

// Layout:
┌─────────────────────────────────────────────────────────────────┐
│  Upload Recipients                                              │
│  Upload a CSV file with your recipient data.                    │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  CSV UPLOAD                                               │ │
│  │                                                           │ │
│  │  [Drop CSV here or click to browse]                       │ │
│  │                                                           │ │
│  │  Required columns: first_name, company, email            │ │
│  │  Optional: industry, custom variables                     │ │
│  │                                                           │ │
│  │  [Download Template CSV]                                  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  PREVIEW (First 5 rows):                                        │
│  ┌──────┬────────────┬──────────────┬─────────────────────┐    │
│  │ #    │ first_name │ company      │ email               │    │
│  │ 1    │ John       │ Acme Inc     │ john@acme.com       │    │
│  │ 2    │ Sarah      │ TechFlow     │ sarah@techflow.io   │    │
│  │ 3    │ Mike       │ StartupXYZ   │ mike@startup.xyz    │    │
│  └──────┴────────────┴──────────────┴─────────────────────┘    │
│                                                                 │
│  Total recipients: 247                                          │
│  Estimated credits: 247 (1 credit per video)                    │
│                                                                 │
│  [+ Add Manually]                                               │
└─────────────────────────────────────────────────────────────────┘

// Features:
// - CSV template download
// - Validation of required columns
// - Preview first 5 rows
// - Manual add button for single entries
// - Credit estimation based on recipient count
```

---

#### STEP 4: Generate Results
```tsx
// components/personalize/GenerateStep.tsx
interface GenerateStepProps {
  campaign: {
    name: string;
    videoUrl: string;
    variables: Variable[];
    recipients: Recipient[];
    estimatedCredits: number;
  };
  onGenerate: () => void;
  isGenerating: boolean;
  progress: {
    completed: number;
    total: number;
    currentRecipient?: string;
  };
}

// Layout (Before Generate):
┌─────────────────────────────────────────────────────────────────┐
│  Generate Results                                               │
│  Review your campaign before generating personalized videos.    │
│                                                                 │
│  CAMPAIGN SUMMARY:                                              │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Name: Q1 Outreach Campaign                               │ │
│  │  Video: [Thumbnail] sales_pitch.mp4                       │ │
│  │  Variables: {{first_name}}, {{company}}                   │ │
│  │  Recipients: 247                                          │ │
│  │  Estimated Cost: 247 credits                              │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  PREVIEW (Sample Video):                                        │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  [Video Player]                                           │ │
│  │  Sample: "Hey John, welcome to Acme Inc!"                 │ │
│  │                                                           │ │
│  │  [▶️ Play Preview]                                        │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  [← Back]                     [Generate 247 Videos]            │
└─────────────────────────────────────────────────────────────────┘

// Layout (During Generation):
┌─────────────────────────────────────────────────────────────────┐
│  Generating Your Videos...                                      │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Processing: John @ Acme Inc                              │ │
│  │                                                           │ │
│  │  [████████████████████████░░░░░░░░░░] 67%                │ │
│  │                                                           │ │
│  │  Completed: 165 / 247 videos                              │ │
│  │  Estimated time remaining: 12 minutes                     │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  [View Partial Results]  [Pause]  [Cancel]                      │
└─────────────────────────────────────────────────────────────────┘

// Layout (After Generation):
┌─────────────────────────────────────────────────────────────────┐
│  ✅ All Videos Generated!                                       │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Completed: 247 / 247 videos                              │ │
│  │  Total credits used: 247                                  │ │
│  │  Average processing time: 4.2s per video                  │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ACTIONS:                                                       │
│  [Download All (ZIP)]  [View Individual]  [Send via Email]     │
│                                                                 │
│  RECENT GENERATIONS:                                            │
│  ┌────────────────┬────────────┬──────────────┬─────────────┐  │
│  │ Recipient      │ Company    │ Status       │ Actions     │  │
│  │ John Smith     │ Acme Inc   │ ✅ Ready     │ [⬇️] [📧]  │  │
│  │ Sarah Chen     │ TechFlow   │ ✅ Ready     │ [⬇️] [📧]  │  │
│  │ ...            │ ...        │ ...          │ ...         │  │
│  └────────────────┴────────────┴──────────────┴─────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 3. PROJECTS DASHBOARD

```tsx
// components/projects/ProjectsDashboard.tsx
interface Project {
  id: string;
  name: string;
  type: 'personalization' | 'translation';
  status: 'draft' | 'processing' | 'completed' | 'failed';
  recipients: number;
  completedVideos: number;
  createdBy: string;
  sourceLanguage: string;
  createdAt: string;
  updatedAt: string;
  thumbnail?: string;
}

// Layout (Same as LipDub screenshot):
┌─────────────────────────────────────────────────────────────────┐
│  My Projects                                                    │
│  [Search for a project]                    [+ Create Project]   │
│                                                                 │
│  ┌──────┬──────────────┬──────────┬────────────┬────────┬──────┐│
│  │ Name │ Type         │ Created  │ Language   │ Date   │ ...  ││
│  ├──────┼──────────────┼──────────┼────────────┼────────┼──────┤│
│  │ Q1   │ Personalize  │ david@.. │ Spanish    │ 02-13  │ [⋮]  ││
│  │ Out..│              │          │            │        │      ││
│  ├──────┼──────────────┼──────────┼────────────┼────────┼──────┤│
│  │ Prod │ Translation  │ david@.. │ English    │ 02-12  │ [⋮]  ││
│  │ Demo │              │          │            │        │      ││
│  └──────┴──────────────┴──────────┴────────────┴────────┴──────┘│
│                                                                 │
│                              <<  <  [1]  >  >>                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4. SUBSCRIPTION PAGE

```tsx
// components/subscription/SubscriptionPage.tsx
interface Subscription {
  plan: 'free' | 'starter' | 'pro' | 'enterprise';
  credits: number;
  trialEndsAt?: string;
  monthlyUsage: {
    videosGenerated: number;
    creditsUsed: number;
  };
}

// Shows:
// - Current plan details
// - Credit balance with [Add Credits] button
// - Usage chart (videos per day/week)
// - Upgrade options
// - Billing history
```

---

## 🔌 API ENDPOINT DOCUMENTATION

### Base URL
```
Production: https://api.jaimeai.com/v1
Staging: https://api-staging.jaimeai.com/v1
```

### Authentication
All requests require an API key in the header:
```
Authorization: Bearer {your_api_key}
```

---

### 1. PROJECTS API

#### List Projects
```http
GET /projects?page=1&limit=50
```

**Response:**
```json
{
  "data": [
    {
      "id": "proj_abc123",
      "name": "Q1 Outreach Campaign",
      "type": "personalization",
      "status": "completed",
      "recipients": 247,
      "completed_videos": 247,
      "created_by": "david@superwave.io",
      "source_language": "es-MX",
      "created_at": "2026-02-13T10:30:00Z",
      "updated_at": "2026-02-13T11:45:00Z",
      "thumbnail_url": "https://cdn.jaimeai.com/thumbs/proj_abc123.jpg"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 12,
    "pages": 1
  }
}
```

---

#### Create Project
```http
POST /projects
Content-Type: application/json

{
  "name": "Q1 Outreach Campaign",
  "type": "personalization"
}
```

**Response:**
```json
{
  "id": "proj_abc123",
  "name": "Q1 Outreach Campaign",
  "type": "personalization",
  "status": "draft",
  "created_at": "2026-02-13T10:30:00Z"
}
```

---

#### Get Project
```http
GET /projects/{project_id}
```

**Response:**
```json
{
  "id": "proj_abc123",
  "name": "Q1 Outreach Campaign",
  "type": "personalization",
  "status": "completed",
  "video_url": "https://cdn.jaimeai.com/videos/source/proj_abc123.mp4",
  "transcript": "Hey {{first_name}}, welcome to {{company}}!",
  "variables": [
    { "name": "first_name", "type": "text", "count": 247 },
    { "name": "company", "type": "company", "count": 247 }
  ],
  "recipients": 247,
  "completed_videos": 247,
  "failed_videos": 0,
  "created_at": "2026-02-13T10:30:00Z",
  "updated_at": "2026-02-13T11:45:00Z"
}
```

---

#### Delete Project
```http
DELETE /projects/{project_id}
```

---

### 2. VIDEO UPLOAD API

#### Upload Source Video
```http
POST /projects/{project_id}/upload
Content-Type: multipart/form-data

video: [binary file data]
```

**Response:**
```json
{
  "upload_id": "upload_xyz789",
  "status": "processing",
  "video_url": "https://cdn.jaimeai.com/videos/source/proj_abc123.mp4",
  "transcript": "Hey there, welcome to our platform!",
  "speakers": [
    {
      "id": "speaker_1",
      "name": "Speaker 1",
      "time_ranges": [[0.5, 3.2], [5.1, 7.8]]
    }
  ]
}
```

---

### 3. VARIABLES API

#### Update Transcript & Variables
```http
PATCH /projects/{project_id}/transcript
Content-Type: application/json

{
  "transcript": "Hey {{first_name}}, welcome to {{company}}!",
  "variables": [
    {
      "name": "first_name",
      "type": "text",
      "position": 4  // Word index in transcript
    },
    {
      "name": "company",
      "type": "company",
      "position": 7
    }
  ]
}
```

---

### 4. RECIPIENTS API

#### Upload Recipients CSV
```http
POST /projects/{project_id}/recipients/upload
Content-Type: multipart/form-data

csv: [binary file data]
```

**Response:**
```json
{
  "uploaded": 247,
  "valid": 245,
  "invalid": 2,
  "errors": [
    {
      "row": 156,
      "error": "Missing required field: email"
    },
    {
      "row": 203,
      "error": "Invalid email format"
    }
  ],
  "preview": [
    {
      "first_name": "John",
      "company": "Acme Inc",
      "email": "john@acme.com",
      "industry": "Technology"
    }
  ]
}
```

---

#### Get Recipients
```http
GET /projects/{project_id}/recipients?page=1&limit=100
```

---

#### Add Single Recipient
```http
POST /projects/{project_id}/recipients
Content-Type: application/json

{
  "first_name": "John",
  "company": "Acme Inc",
  "email": "john@acme.com",
  "industry": "Technology"
}
```

---

### 5. GENERATION API

#### Start Generation
```http
POST /projects/{project_id}/generate
Content-Type: application/json

{
  "voice_type": "ai",  // "ai", "clone", or "tts"
  "voice_id": "voice_spanish_male_01",
  "language": "es-MX"
}
```

**Response:**
```json
{
  "generation_id": "gen_def456",
  "status": "queued",
  "total_recipients": 247,
  "estimated_duration": "15 minutes",
  "estimated_credits": 247
}
```

---

#### Get Generation Status
```http
GET /projects/{project_id}/generation/{generation_id}
```

**Response:**
```json
{
  "generation_id": "gen_def456",
  "status": "processing",
  "progress": {
    "completed": 165,
    "total": 247,
    "percentage": 67,
    "current_recipient": "john@acme.com"
  },
  "results": [
    {
      "recipient_id": "rec_001",
      "status": "completed",
      "video_url": "https://cdn.jaimeai.com/videos/output/proj_abc123/rec_001.mp4",
      "duration": 15.2,
      "credits_used": 1
    }
  ]
}
```

---

#### Get All Generated Videos
```http
GET /projects/{project_id}/videos?page=1&limit=50
```

**Response:**
```json
{
  "data": [
    {
      "recipient_id": "rec_001",
      "recipient_name": "John Smith",
      "recipient_email": "john@acme.com",
      "video_url": "https://cdn.jaimeai.com/videos/output/proj_abc123/rec_001.mp4",
      "download_url": "https://api.jaimeai.com/v1/projects/proj_abc123/videos/rec_001/download",
      "thumbnail_url": "https://cdn.jaimeai.com/thumbs/proj_abc123/rec_001.jpg",
      "duration": 15.2,
      "status": "completed",
      "created_at": "2026-02-13T11:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 247
  }
}
```

---

### 6. CREDITS API

#### Get Credit Balance
```http
GET /credits
```

**Response:**
```json
{
  "balance": 2000,
  "subscription": {
    "plan": "starter",
    "monthly_credits": 5000,
    "used_this_month": 3000,
    "resets_at": "2026-03-01T00:00:00Z"
  },
  "trial": {
    "is_active": true,
    "days_remaining": 14,
    "trial_credits": 100
  }
}
```

---

#### Get Credit Usage History
```http
GET /credits/usage?start_date=2026-02-01&end_date=2026-02-13
```

**Response:**
```json
{
  "data": [
    {
      "date": "2026-02-13",
      "credits_used": 247,
      "videos_generated": 247,
      "project_id": "proj_abc123",
      "project_name": "Q1 Outreach Campaign"
    }
  ],
  "summary": {
    "total_credits_used": 3000,
    "total_videos_generated": 3000
  }
}
```

---

### 7. VOICES API

#### List Available Voices
```http
GET /voices?language=es-MX&gender=male
```

**Response:**
```json
{
  "data": [
    {
      "id": "voice_spanish_male_01",
      "name": "Miguel (Mexican)",
      "language": "es-MX",
      "gender": "male",
      "age_range": "30-40",
      "preview_url": "https://cdn.jaimeai.com/voices/voice_spanish_male_01.mp3",
      "is_cloned": false
    },
    {
      "id": "voice_spanish_female_01",
      "name": "Sofia (Mexican)",
      "language": "es-MX",
      "gender": "female",
      "age_range": "25-35",
      "preview_url": "https://cdn.jaimeai.com/voices/voice_spanish_female_01.mp3",
      "is_cloned": false
    }
  ]
}
```

---

#### Clone Voice
```http
POST /voices/clone
Content-Type: multipart/form-data

name: "My Voice"
audio_sample: [binary file data]
```

**Response:**
```json
{
  "voice_id": "voice_clone_abc123",
  "name": "My Voice",
  "status": "processing",
  "estimated_time": "10 minutes"
}
```

---

## 🔄 WORKFLOW DIAGRAMS

### 1. Personalization Campaign Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ PERSONALIZATION CAMPAIGN WORKFLOW                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  USER                              SYSTEM                                   │
│   │                                  │                                      │
│   │ Click "Personalize a video"     │                                      │
│   │────────────────────────────────>│                                      │
│   │                                  │                                      │
│   │                                  │ Create project (status: draft)       │
│   │                                  │ POST /projects                       │
│   │                                  │                                      │
│   │ Show upload screen               │                                      │
│   │<─────────────────────────────────│                                      │
│   │                                  │                                      │
│   │ Upload video file                │                                      │
│   │────────────────────────────────>│                                      │
│   │                                  │ POST /projects/{id}/upload           │
│   │                                  │ Process:                             │
│   │                                  │ 1. Upload to S3                      │
│   │                                  │ 2. Generate transcript (Whisper)     │
│   │                                  │ 3. Detect speakers                   │
│   │                                  │                                      │
│   │ Show transcript + variables UI   │                                      │
│   │<─────────────────────────────────│                                      │
│   │                                  │                                      │
│   │ Select words → variables         │                                      │
│   │────────────────────────────────>│                                      │
│   │                                  │ PATCH /projects/{id}/transcript      │
│   │                                  │                                      │
│   │ Upload CSV with recipients       │                                      │
│   │────────────────────────────────>│                                      │
│   │                                  │ POST /projects/{id}/recipients       │
│   │                                  │ Validate CSV                         │
│   │                                  │ Return preview + errors              │
│   │                                  │                                      │
│   │ Show recipient preview           │                                      │
│   │<─────────────────────────────────│                                      │
│   │                                  │                                      │
│   │ Click "Generate"                 │                                      │
│   │────────────────────────────────>│                                      │
│   │                                  │ POST /projects/{id}/generate         │
│   │                                  │ Queue job                            │
│   │                                  │ Return: generation_id                │
│   │                                  │                                      │
│   │ Show progress bar                │                                      │
│   │                                  │ GET /projects/{id}/generation/{gid}  │
│   │                                  │ (polling every 5s)                   │
│   │                                  │                                      │
│   │                                  │ Background Worker:                   │
│   │                                  │ For each recipient:                  │
│   │                                  │ 1. Generate TTS audio                │
│   │                                  │ 2. AI lip-sync                       │
│   │                                  │ 3. Upload to CDN                     │
│   │                                  │ 4. Update status                     │
│   │                                  │                                      │
│   │ All videos ready!                │                                      │
│   │<─────────────────────────────────│                                      │
│   │                                  │                                      │
│   │ Download or send emails          │                                      │
│   │                                  │ GET /projects/{id}/videos            │
│   │                                  │                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 2. Video Generation Worker Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ VIDEO GENERATION WORKER (Background Process)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  QUEUE: generation_jobs                                                     │
│                                                                             │
│  Worker picks up job: {                                                     │
│    project_id: "proj_abc123",                                               │
│    recipient: { first_name: "John", company: "Acme" },                      │
│    variable_values: { first_name: "John", company: "Acme Inc" },            │
│    voice_id: "voice_spanish_male_01"                                        │
│  }                                                                          │
│                                                                             │
│  STEP 1: TEXT-TO-SPEECH                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Input: "Hey John, welcome to Acme Inc!"                            │   │
│  │                                                                     │   │
│  │ TTS Engine (ElevenLabs / Azure / Google)                           │   │
│  │                                                                     │   │
│  │ Output: audio_track.wav (15.2s, 44.1kHz)                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  STEP 2: AI LIP-SYNC                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Input:                                                              │   │
│  │   - Source video (MP4)                                             │   │
│  │   - Generated audio (WAV)                                          │   │
│  │   - Speaker segments (time ranges)                                 │   │
│  │                                                                     │   │
│  │ LipDub / Wav2Lip / Custom Model                                    │   │
│  │                                                                     │   │
│  │ Process:                                                           │   │
│  │ 1. Extract face landmarks                                          │   │
│  │ 2. Analyze audio phonemes                                          │   │
│  │ 3. Generate lip movements                                          │   │
│  │ 4. Blend with original video                                       │   │
│  │                                                                     │   │
│  │ Output: personalized_video.mp4                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  STEP 3: POST-PROCESSING                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ - Encode to H.264                                                   │   │
│  │ - Generate thumbnail (frame at 1s)                                  │   │
│  │ - Upload to CDN (CloudFront/S3)                                     │   │
│  │ - Create download URL                                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  STEP 4: UPDATE DATABASE                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ UPDATE recipient_videos SET                                         │   │
│  │   status = 'completed',                                             │   │
│  │   video_url = 'https://cdn.../rec_001.mp4',                         │   │
│  │   completed_at = NOW()                                              │   │
│  │ WHERE id = 'rec_001';                                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  STEP 5: NOTIFY CLIENT (WebSocket/SSE)                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Send progress update:                                               │   │
│  │ {                                                                   │   │
│  │   type: 'video_completed',                                          │   │
│  │   recipient_id: 'rec_001',                                          │   │
│  │   video_url: 'https://cdn...',                                      │   │
│  │   progress: { completed: 165, total: 247 }                          │   │
│  │ }                                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 3. Credit Deduction Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CREDIT MANAGEMENT WORKFLOW                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  When user clicks "Generate":                                               │
│                                                                             │
│  1. VALIDATE CREDITS                                                        │
│     ┌─────────────────────────────────────────────────────────────────────┐│
│     │ SELECT balance FROM user_credits WHERE user_id = ?;                 ││
│     │                                                                     ││
│     │ IF balance >= recipients.count:                                    ││
│     │   → Continue                                                        ││
│     │ ELSE:                                                               ││
│     │   → Return error: "Insufficient credits"                            ││
│     │   → Show "Add Credits" modal                                        ││
│     └─────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  2. RESERVE CREDITS (Atomic)                                                │
│     ┌─────────────────────────────────────────────────────────────────────┐│
│     │ BEGIN TRANSACTION;                                                  ││
│     │                                                                     ││
│     │ UPDATE user_credits                                                 ││
│     │ SET reserved_credits = reserved_credits + 247,                      ││
│     │     balance = balance - 247                                         ││
│     │ WHERE user_id = ?;                                                  ││
│     │                                                                     ││
│     │ INSERT INTO credit_transactions                                     ││
│     │ (user_id, amount, type, project_id, status)                         ││
│     │ VALUES (?, 247, 'reserved', 'proj_abc123', 'pending');              ││
│     │                                                                     ││
│     │ COMMIT;                                                             ││
│     └─────────────────────────────────────────────────────────────────────┘│
│                                                                             │
│  3. ON GENERATION COMPLETE                                                  │
│     ┌─────────────────────────────────────────────────────────────────────┐│
│     │ // Success case                                                     ││
│     │ UPDATE credit_transactions                                          ││
│     │ SET status = 'completed',                                           ││
│     │     completed_at = NOW()                                            ││
│     │ WHERE project_id = 'proj_abc123';                                   ││
│     │                                                                     ││
│     │ // Refund if some failed                                            ││
│     │ IF failed_videos > 0:                                                ││
│     │   UPDATE user_credits                                               ││
│     │   SET balance = balance + failed_videos                             ││
│     │   WHERE user_id = ?;                                                ││
│     │                                                                     ││
│     │   INSERT INTO credit_transactions                                   ││
│     │   (user_id, amount, type, status)                                   ││
│     │   VALUES (?, failed_videos, 'refund', 'completed');                 ││
│     └─────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 PROJECT FILE STRUCTURE

```
jaime-ai-goon-generator/
├── apps/
│   ├── web/                          # Next.js frontend
│   │   ├── app/
│   │   │   ├── layout.tsx            # Root layout with sidebar
│   │   │   ├── page.tsx              # Redirect to /projects
│   │   │   ├── personalize/
│   │   │   │   └── page.tsx          # Personalization wizard
│   │   │   ├── projects/
│   │   │   │   └── page.tsx          # Projects dashboard
│   │   │   └── subscription/
│   │   │       └── page.tsx          # Subscription management
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Header.tsx
│   │   │   │   └── Layout.tsx
│   │   │   ├── personalize/
│   │   │   │   ├── StepProgress.tsx
│   │   │   │   ├── UploadStep.tsx
│   │   │   │   ├── VariablesStep.tsx
│   │   │   │   ├── RecipientsStep.tsx
│   │   │   │   └── GenerateStep.tsx
│   │   │   ├── projects/
│   │   │   │   ├── ProjectsTable.tsx
│   │   │   │   └── ProjectRow.tsx
│   │   │   └── ui/                   # Shared UI components
│   │   │       ├── Button.tsx
│   │   │       ├── Input.tsx
│   │   │       ├── Modal.tsx
│   │   │       └── ProgressBar.tsx
│   │   ├── hooks/
│   │   │   ├── useProjects.ts
│   │   │   ├── useUpload.ts
│   │   │   └── useGeneration.ts
│   │   ├── lib/
│   │   │   ├── api.ts                # API client
│   │   │   └── utils.ts
│   │   └── styles/
│   │       └── globals.css           # Dark theme colors
│   └── api/                          # Backend API (optional)
│       └── src/
│           ├── routes/
│           │   ├── projects.ts
│           │   ├── upload.ts
│           │   ├── generation.ts
│           │   └── credits.ts
│           └── workers/
│               └── video-generator.ts
├── packages/
│   └── shared/
│       └── types/
│           └── index.ts              # Shared TypeScript types
└── README.md
```

---

## 🚀 MVP LAUNCH CHECKLIST

### Phase 1: Core UI (Week 1)
- [ ] Sidebar navigation
- [ ] Header with credits/trial
- [ ] Dark theme setup
- [ ] Projects dashboard
- [ ] Create project button

### Phase 2: Personalization Flow (Week 2)
- [ ] Upload video step
- [ ] Transcript viewer
- [ ] Variable selection
- [ ] CSV upload
- [ ] Recipient preview

### Phase 3: Generation (Week 3)
- [ ] Generation settings
- [ ] Progress tracking
- [ ] Results download
- [ ] Email delivery

### Phase 4: Polish (Week 4)
- [ ] Error handling
- [ ] Loading states
- [ ] Mobile responsive
- [ ] Analytics dashboard

---

**Ready to build Jaime AI Goon Generator?** Pick a phase and let's start coding!
