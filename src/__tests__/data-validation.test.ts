/**
 * TDD Tests for Data Validation - Critical Security Fix
 */

import { 
  validateProject, 
  parseProjectData, 
  validateRecordingSettings,
  sanitizeProjectName,
  validateTimelineClip
} from '../lib/security/data-validation'
import type { Project, RecordingSettings, TimelineClip } from '../types'

describe('Data Validation', () => {
  describe('Project Validation', () => {
    it('should validate valid project', () => {
      const validProject: Project = {
        id: 'project-123',
        name: 'Test Project',
        clips: [],
        animations: [],
        settings: {
          area: 'fullscreen',
          audioInput: 'system',
          quality: 'high',
          framerate: 60,
          format: 'webm'
        },
        createdAt: new Date(),
        updatedAt: new Date()
      }

      expect(validateProject(validProject)).toBe(true)
    })

    it('should reject project with missing required fields', () => {
      const invalidProject = {
        name: 'Test Project',
        clips: []
        // missing id, animations, settings
      } as any

      expect(validateProject(invalidProject)).toBe(false)
    })

    it('should reject project with invalid types', () => {
      const invalidProject = {
        id: 123, // should be string
        name: 'Test Project',
        clips: 'not-an-array', // should be array
        animations: [],
        settings: {}
      } as any

      expect(validateProject(invalidProject)).toBe(false)
    })

    it('should accept project with valid data', () => {
      const validProject = {
        id: 'project-123',
        name: 'Normal Project Name',
        clips: [],
        animations: [],
        settings: {
          area: 'fullscreen',
          audioInput: 'system',
          quality: 'high',
          framerate: 60,
          format: 'webm'
        }
      } as any

      expect(validateProject(validProject)).toBe(true)
    })
  })

  describe('Project Data Parsing', () => {
    it('should parse valid JSON project data', () => {
      const validData = JSON.stringify([{
        id: 'project-123',
        name: 'Test Project',
        clips: [],
        animations: [],
        settings: {
          area: 'fullscreen',
          audioInput: 'system',
          quality: 'high',
          framerate: 60,
          format: 'webm'
        }
      }])

      const result = parseProjectData(validData)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('project-123')
    })

    it('should return empty array for invalid JSON', () => {
      const invalidData = 'not-valid-json'
      
      const result = parseProjectData(invalidData)
      expect(result).toEqual([])
    })

    it('should filter out invalid projects', () => {
      const mixedData = JSON.stringify([
        {
          id: 'valid-project',
          name: 'Valid Project',
          clips: [],
          animations: [],
          settings: {
            area: 'fullscreen',
            audioInput: 'system',
            quality: 'high',
            framerate: 60,
            format: 'webm'
          }
        },
        {
          id: 'invalid-project',
          // missing required fields
        },
        'not-an-object'
      ])

      const result = parseProjectData(mixedData)
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('valid-project')
    })

    it('should handle empty data gracefully', () => {
      expect(parseProjectData('')).toEqual([])
      expect(parseProjectData('null')).toEqual([])
      expect(parseProjectData('undefined')).toEqual([])
    })
  })

  describe('Recording Settings Validation', () => {
    it('should validate valid recording settings', () => {
      const validSettings: RecordingSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 60,
        format: 'webm'
      }

      expect(validateRecordingSettings(validSettings)).toBe(true)
    })

    it('should reject invalid enum values', () => {
      const invalidSettings = {
        area: 'invalid-area',
        audioInput: 'system',
        quality: 'high',
        framerate: 60,
        format: 'webm'
      } as any

      expect(validateRecordingSettings(invalidSettings)).toBe(false)
    })

    it('should reject invalid framerate values', () => {
      const invalidSettings = {
        area: 'fullscreen',
        audioInput: 'system',
        quality: 'high',
        framerate: 120, // only 30 and 60 allowed
        format: 'webm'
      } as any

      expect(validateRecordingSettings(invalidSettings)).toBe(false)
    })
  })

  describe('Timeline Clip Validation', () => {
    it('should validate valid timeline clip', () => {
      const validClip: TimelineClip = {
        id: 'clip-123',
        name: 'Test Clip',
        type: 'video',
        source: 'blob:mock-url',
        startTime: 0,
        duration: 5000,
        trackIndex: 0,
        thumbnail: ''
      }

      expect(validateTimelineClip(validClip)).toBe(true)
    })

    it('should reject clip with negative duration', () => {
      const invalidClip = {
        id: 'clip-123',
        name: 'Test Clip',
        type: 'video',
        source: 'blob:mock-url',
        startTime: 0,
        duration: -1000, // negative duration
        trackIndex: 0,
        thumbnail: ''
      } as any

      expect(validateTimelineClip(invalidClip)).toBe(false)
    })

    it('should accept clip with valid data', () => {
      const validClip = {
        id: 'clip-123',
        name: 'Test Clip',
        type: 'video',
        source: 'blob:valid-url',
        startTime: 0,
        duration: 5000,
        trackIndex: 0,
        thumbnail: ''
      } as any

      expect(validateTimelineClip(validClip)).toBe(true)
    })
  })

  describe('Project Name Sanitization', () => {
    it('should sanitize project names', () => {
      expect(sanitizeProjectName('Normal Project')).toBe('Normal Project')
      expect(sanitizeProjectName('<script>alert("xss")</script>'))
        .toBe('alert("xss")')
      expect(sanitizeProjectName('')).toBe('Untitled Project')
    })
  })

  describe('Edge Cases', () => {
    it('should handle null and undefined gracefully', () => {
      expect(validateProject(null as any)).toBe(false)
      expect(validateProject(undefined as any)).toBe(false)
      expect(validateRecordingSettings(null as any)).toBe(false)
      expect(validateTimelineClip(undefined as any)).toBe(false)
    })
  })
})