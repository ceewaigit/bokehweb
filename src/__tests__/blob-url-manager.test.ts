/**
 * TDD Tests for BlobURLManager - Critical Security Fix
 */

import { BlobURLManager } from '../lib/security/blob-url-manager'

// Mock URL.createObjectURL and URL.revokeObjectURL
const mockCreateObjectURL = jest.fn()
const mockRevokeObjectURL = jest.fn()

// Store original URL methods
const originalURL = global.URL

beforeAll(() => {
  global.URL = {
    ...originalURL,
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  } as any
})

afterAll(() => {
  global.URL = originalURL
})

beforeEach(() => {
  mockCreateObjectURL.mockClear()
  mockRevokeObjectURL.mockClear()
  
  // Return unique URLs for each call
  let counter = 0
  mockCreateObjectURL.mockImplementation(() => {
    counter++
    return `blob:mock-url-${counter}`
  })
})

describe('BlobURLManager', () => {
  let manager: BlobURLManager

  beforeEach(() => {
    manager = new BlobURLManager()
  })

  afterEach(() => {
    manager.dispose()
  })

  describe('URL Creation', () => {
    it('should create and track blob URLs', () => {
      const blob = new Blob(['test'], { type: 'text/plain' })
      
      const url = manager.create(blob)
      
      expect(mockCreateObjectURL).toHaveBeenCalledWith(blob)
      expect(url).toBe('blob:mock-url-1')
      expect(manager.getUrlCount()).toBe(1)
    })

    it('should prevent creation after disposal', () => {
      const blob = new Blob(['test'])
      manager.dispose()
      
      expect(() => manager.create(blob)).toThrow('BlobURLManager has been disposed')
    })

    it('should track multiple URLs', () => {
      const blob = new Blob(['test'])
      manager.create(blob)
      manager.create(blob)
      
      expect(manager.getUrlCount()).toBe(2)
    })
  })

  describe('URL Revocation', () => {
    it('should revoke specific URLs', () => {
      const blob = new Blob(['test'])
      const url = manager.create(blob)
      
      manager.revoke(url)
      
      expect(mockRevokeObjectURL).toHaveBeenCalledWith(url)
      expect(manager.getUrlCount()).toBe(0)
    })

    it('should handle revoking non-existent URLs gracefully', () => {
      manager.revoke('blob:non-existent')
      
      expect(mockRevokeObjectURL).not.toHaveBeenCalled()
    })
  })

  describe('Memory Management', () => {
    it('should track URL count', () => {
      const blob1 = new Blob(['test1'])
      const blob2 = new Blob(['test2'])
      
      manager.create(blob1)
      manager.create(blob2)
      
      expect(manager.getUrlCount()).toBe(2)
    })
  })

  describe('Cleanup', () => {
    it('should cleanup all URLs', () => {
      const blob1 = new Blob(['test1'])
      const blob2 = new Blob(['test2'])
      
      manager.create(blob1)
      manager.create(blob2)
      
      manager.cleanup()
      
      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(2)
      expect(manager.getUrlCount()).toBe(0)
    })

    it('should handle errors during cleanup gracefully', () => {
      mockRevokeObjectURL.mockImplementation(() => {
        throw new Error('Mock revoke error')
      })
      
      const blob = new Blob(['test'])
      manager.create(blob)
      
      expect(() => manager.cleanup()).not.toThrow()
    })
  })

  describe('Disposal', () => {
    it('should dispose properly', () => {
      const blob = new Blob(['test'])
      manager.create(blob)
      
      manager.dispose()
      
      expect(mockRevokeObjectURL).toHaveBeenCalled()
      expect(manager.getUrlCount()).toBe(0)
    })

    it('should only dispose once', () => {
      const blob = new Blob(['test'])
      manager.create(blob)
      
      manager.dispose()
      manager.dispose() // Second call should not throw
      
      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1)
    })
  })
})