import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const fontsDir = path.join(rootDir, 'public', 'fonts')

// Ensure fonts directory exists
if (!fs.existsSync(fontsDir)) {
  fs.mkdirSync(fontsDir, { recursive: true })
}

// Font files to download from GitHub releases
// Latest version: v1.521
// Note: If download fails, please download manually from:
// https://github.com/lxgw/LxgwWenKai/releases/latest
const fontFiles = [
  {
    name: 'LXGWWenKai-Regular.ttf',
    url: 'https://github.com/lxgw/LxgwWenKai/releases/download/v1.521/LXGWWenKai-Regular.ttf',
  },
  {
    name: 'LXGWWenKai-Medium.ttf',
    url: 'https://github.com/lxgw/LxgwWenKai/releases/download/v1.521/LXGWWenKai-Medium.ttf',
  },
  // Note: SemiBold and Bold variants are not available as separate files
  // Medium will be used for font-weight 600, and Regular for 700 (browser will synthesize)
]

async function downloadFont(file) {
  const filePath = path.join(fontsDir, file.name)
  
  // Skip if file already exists
  if (fs.existsSync(filePath)) {
    console.log(`⏭️  Skipping ${file.name} (already exists)`)
    return
  }

  try {
    console.log(`📥 Downloading ${file.name}...`)
    const response = await fetch(file.url)
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const buffer = await response.arrayBuffer()
    fs.writeFileSync(filePath, Buffer.from(buffer))
    console.log(`✓ Downloaded ${file.name}`)
  } catch (error) {
    console.error(`✗ Failed to download ${file.name}:`, error.message)
    console.error(`  URL: ${file.url}`)
    console.error(`  Please download manually from: https://github.com/lxgw/LxgwWenKai/releases`)
    throw error
  }
}

async function downloadFonts() {
  console.log('Downloading LXGW WenKai fonts...\n')
  
  try {
    for (const file of fontFiles) {
      await downloadFont(file)
    }
    
    console.log('\n✓ All fonts downloaded successfully!')
    console.log(`Fonts are located at: ${fontsDir}`)
  } catch (error) {
    console.error('\n✗ Some fonts failed to download')
    console.error('Please download manually from: https://github.com/lxgw/LxgwWenKai/releases')
    console.error('Place the font files in:', fontsDir)
    process.exit(1)
  }
}

downloadFonts()

