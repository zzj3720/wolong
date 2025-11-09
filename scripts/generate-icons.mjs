import sharp from 'sharp'
import toIco from 'to-ico'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const buildDir = path.join(rootDir, 'build')
const svgPath = path.join(rootDir, 'public', 'wolong.svg')

// Ensure build directory exists
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true })
}

async function generateIcons() {
  console.log('Generating icons from SVG...')
  
  if (!fs.existsSync(svgPath)) {
    console.error(`Error: SVG file not found at ${svgPath}`)
    process.exit(1)
  }

  try {
    // Helper function to generate icon with reduced padding
    async function generateIcon(outputPath, size, paddingPercent = 0.05) {
      // Render SVG larger than target size
      const renderSize = Math.floor(size * 1.5)
      
      // Render SVG and trim transparent edges
      const svgBuffer = await sharp(svgPath)
        .resize(renderSize, renderSize, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toBuffer()
      
      // Trim to get actual content bounds
      const trimmed = await sharp(svgBuffer)
        .trim({ threshold: 10 })
        .png()
        .toBuffer({ resolveWithObject: true })
      
      // Calculate scale to fill most of the target size (with small padding)
      const padding = Math.floor(size * paddingPercent)
      const maxContentSize = size - padding * 2
      const scale = Math.min(maxContentSize / trimmed.info.width, maxContentSize / trimmed.info.height)
      
      const finalWidth = Math.floor(trimmed.info.width * scale)
      const finalHeight = Math.floor(trimmed.info.height * scale)
      
      // Resize and center on canvas
      await sharp(trimmed.data)
        .resize(finalWidth, finalHeight, {
          kernel: sharp.kernel.lanczos3
        })
        .extend({
          top: Math.floor((size - finalHeight) / 2),
          bottom: Math.ceil((size - finalHeight) / 2),
          left: Math.floor((size - finalWidth) / 2),
          right: Math.ceil((size - finalWidth) / 2),
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(outputPath)
    }

    // Generate PNG (512x512) - primary icon
    const pngPath = path.join(buildDir, 'icon.png')
    await generateIcon(pngPath, 512, 0.05)
    console.log('✓ Generated icon.png (512x512)')

    // Generate PNG (256x256) for ICO
    const png256Path = path.join(buildDir, 'icon-256.png')
    await generateIcon(png256Path, 256, 0.05)
    console.log('✓ Generated icon-256.png (256x256)')

    // Generate PNG (128x128) for ICO
    const png128Path = path.join(buildDir, 'icon-128.png')
    await generateIcon(png128Path, 128, 0.05)
    console.log('✓ Generated icon-128.png (128x128)')

    // Generate PNG (64x64) for ICO
    const png64Path = path.join(buildDir, 'icon-64.png')
    await generateIcon(png64Path, 64, 0.05)
    console.log('✓ Generated icon-64.png (64x64)')

    // Generate PNG (32x32) for ICO
    const png32Path = path.join(buildDir, 'icon-32.png')
    await generateIcon(png32Path, 32, 0.05)
    console.log('✓ Generated icon-32.png (32x32)')

    // Generate PNG (16x16) for ICO
    const png16Path = path.join(buildDir, 'icon-16.png')
    await generateIcon(png16Path, 16, 0.05)
    console.log('✓ Generated icon-16.png (16x16)')

    // Generate ICO file for Windows (multi-size)
    const icoPath = path.join(buildDir, 'icon.ico')
    const icoBuffers = await Promise.all([
      fs.promises.readFile(png16Path),
      fs.promises.readFile(png32Path),
      fs.promises.readFile(png64Path),
      fs.promises.readFile(png128Path),
      fs.promises.readFile(png256Path),
    ])
    
    const icoBuffer = await toIco(icoBuffers)
    fs.writeFileSync(icoPath, icoBuffer)
    console.log('✓ Generated icon.ico (multi-size)')
    
    // Clean up temporary PNG files
    fs.unlinkSync(png16Path)
    fs.unlinkSync(png32Path)
    fs.unlinkSync(png64Path)
    fs.unlinkSync(png128Path)
    fs.unlinkSync(png256Path)
    console.log('✓ Cleaned up temporary files')
    
    console.log('\n✓ All icons generated successfully!')
    console.log('Generated files:')
    console.log('  - build/icon.png (512x512) - for Linux and general use')
    console.log('  - build/icon.ico (multi-size) - for Windows')
    console.log('Note: electron-builder will automatically convert PNG to ICNS for macOS during build.')
    
  } catch (error) {
    console.error('Error generating icons:', error)
    process.exit(1)
  }
}

generateIcons()

