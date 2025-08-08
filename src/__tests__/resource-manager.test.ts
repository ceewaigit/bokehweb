/**
 * TDD Tests for ResourceManager - Critical Memory Leak Fix
 */

import { ResourceManager } from '../lib/core/resource-manager'

describe('ResourceManager', () => {
  let manager: ResourceManager

  beforeEach(() => {
    manager = new ResourceManager()
  })

  afterEach(() => {
    manager.dispose()
  })

  describe('Resource Registration', () => {
    it('should register cleanup functions', () => {
      const cleanup = jest.fn()
      
      const unregister = manager.register(cleanup)
      
      expect(typeof unregister).toBe('function')
      expect(manager.getResourceCount()).toBe(1)
    })

    it('should return unregister function that removes cleanup', () => {
      const cleanup = jest.fn()
      
      const unregister = manager.register(cleanup)
      unregister()
      
      expect(manager.getResourceCount()).toBe(0)
    })

    it('should prevent registration after disposal', () => {
      const cleanup = jest.fn()
      manager.dispose()
      
      expect(() => manager.register(cleanup)).toThrow('ResourceManager has been disposed')
    })
  })

  describe('Resource Management', () => {
    it('should track multiple resources', () => {
      const cleanup1 = jest.fn()
      const cleanup2 = jest.fn()
      const cleanup3 = jest.fn()
      
      manager.register(cleanup1)
      manager.register(cleanup2)
      manager.register(cleanup3)
      
      expect(manager.getResourceCount()).toBe(3)
    })

    it('should allow registering with identifiers', () => {
      const cleanup = jest.fn()
      
      manager.register(cleanup, 'test-resource')
      
      expect(manager.getResourceCount()).toBe(1)
      expect(manager.hasResource('test-resource')).toBe(true)
    })

    it('should prevent duplicate identifiers', () => {
      const cleanup1 = jest.fn()
      const cleanup2 = jest.fn()
      
      manager.register(cleanup1, 'test-resource')
      
      expect(() => manager.register(cleanup2, 'test-resource'))
        .toThrow('Resource with identifier "test-resource" already exists')
    })
  })

  describe('Resource Cleanup', () => {
    it('should dispose all resources', () => {
      const cleanup1 = jest.fn()
      const cleanup2 = jest.fn()
      const cleanup3 = jest.fn()
      
      manager.register(cleanup1)
      manager.register(cleanup2)
      manager.register(cleanup3)
      
      manager.dispose()
      
      expect(cleanup1).toHaveBeenCalledTimes(1)
      expect(cleanup2).toHaveBeenCalledTimes(1)
      expect(cleanup3).toHaveBeenCalledTimes(1)
      expect(manager.getResourceCount()).toBe(0)
    })

    it('should handle errors during cleanup gracefully', () => {
      const goodCleanup = jest.fn()
      const errorCleanup = jest.fn(() => {
        throw new Error('Cleanup error')
      })
      const anotherGoodCleanup = jest.fn()
      
      manager.register(goodCleanup)
      manager.register(errorCleanup)
      manager.register(anotherGoodCleanup)
      
      expect(() => manager.dispose()).not.toThrow()
      
      expect(goodCleanup).toHaveBeenCalled()
      expect(errorCleanup).toHaveBeenCalled()
      expect(anotherGoodCleanup).toHaveBeenCalled()
    })

    it('should only dispose once', () => {
      const cleanup = jest.fn()
      
      manager.register(cleanup)
      manager.dispose()
      manager.dispose() // Second call should not run cleanup again
      
      expect(cleanup).toHaveBeenCalledTimes(1)
    })
  })

  describe('Specific Resource Cleanup', () => {
    it('should cleanup specific resource by identifier', () => {
      const cleanup1 = jest.fn()
      const cleanup2 = jest.fn()
      
      manager.register(cleanup1, 'resource1')
      manager.register(cleanup2, 'resource2')
      
      manager.cleanupResource('resource1')
      
      expect(cleanup1).toHaveBeenCalledTimes(1)
      expect(cleanup2).not.toHaveBeenCalled()
      expect(manager.getResourceCount()).toBe(1)
      expect(manager.hasResource('resource1')).toBe(false)
      expect(manager.hasResource('resource2')).toBe(true)
    })

    it('should handle cleaning up non-existent resource', () => {
      expect(() => manager.cleanupResource('non-existent')).not.toThrow()
    })
  })

  describe('Error Handling', () => {
    it('should provide error callback for cleanup failures', () => {
      const errorHandler = jest.fn()
      const manager = new ResourceManager(errorHandler)
      
      const failingCleanup = jest.fn(() => {
        throw new Error('Test error')
      })
      
      manager.register(failingCleanup)
      manager.dispose()
      
      expect(errorHandler).toHaveBeenCalledWith(
        expect.any(Error),
        undefined
      )
    })

    it('should provide identifier in error callback', () => {
      const errorHandler = jest.fn()
      const manager = new ResourceManager(errorHandler)
      
      const failingCleanup = jest.fn(() => {
        throw new Error('Test error')
      })
      
      manager.register(failingCleanup, 'failing-resource')
      manager.dispose()
      
      expect(errorHandler).toHaveBeenCalledWith(
        expect.any(Error),
        'failing-resource'
      )
    })
  })

  describe('Resource Information', () => {
    it('should provide resource information', () => {
      manager.register(jest.fn(), 'resource1')
      manager.register(jest.fn(), 'resource2')
      manager.register(jest.fn()) // unnamed resource
      
      const info = manager.getResourceInfo()
      
      expect(info.totalResources).toBe(3)
      expect(info.namedResources).toBe(2)
      expect(info.identifiers).toEqual(['resource1', 'resource2'])
    })
  })
})