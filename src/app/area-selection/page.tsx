'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

interface SelectionBounds {
    x: number
    y: number
    width: number
    height: number
}

export default function AreaSelectionPage() {
    const [isSelecting, setIsSelecting] = useState(false)
    const [startPoint, setStartPoint] = useState({ x: 0, y: 0 })
    const [currentBounds, setCurrentBounds] = useState<SelectionBounds | null>(null)
    const overlayRef = useRef<HTMLDivElement>(null)

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        setIsSelecting(true)
        setStartPoint({ x: e.clientX, y: e.clientY })
        setCurrentBounds({
            x: e.clientX,
            y: e.clientY,
            width: 0,
            height: 0
        })
    }, [])

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isSelecting) return

        const x = Math.min(startPoint.x, e.clientX)
        const y = Math.min(startPoint.y, e.clientY)
        const width = Math.abs(e.clientX - startPoint.x)
        const height = Math.abs(e.clientY - startPoint.y)

        setCurrentBounds({ x, y, width, height })
    }, [isSelecting, startPoint])

    const handleMouseUp = useCallback(() => {
        if (!isSelecting || !currentBounds) return
        setIsSelecting(false)

        // Validate minimum size (50x50)
        if (currentBounds.width < 50 || currentBounds.height < 50) {
            setCurrentBounds(null)
            return
        }

        // Send selection to main process via IPC
        if (window.electronAPI?.sendAreaSelection) {
            window.electronAPI.sendAreaSelection({
                x: Math.round(currentBounds.x),
                y: Math.round(currentBounds.y),
                width: Math.round(currentBounds.width),
                height: Math.round(currentBounds.height)
            })
        }
    }, [isSelecting, currentBounds])

    const handleCancel = useCallback(() => {
        if (window.electronAPI?.cancelAreaSelection) {
            window.electronAPI.cancelAreaSelection()
        }
    }, [])

    // Handle Escape key to cancel
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleCancel()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleCancel])

    return (
        <div
            ref={overlayRef}
            className="area-selection-overlay"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                cursor: 'crosshair',
                zIndex: 9999,
            }}
        >
            {/* Selection rectangle */}
            {currentBounds && currentBounds.width > 0 && currentBounds.height > 0 && (
                <div
                    style={{
                        position: 'absolute',
                        left: currentBounds.x,
                        top: currentBounds.y,
                        width: currentBounds.width,
                        height: currentBounds.height,
                        border: '2px solid #0066FF',
                        backgroundColor: 'rgba(0, 102, 255, 0.1)',
                        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)',
                    }}
                >
                    {/* Size indicator */}
                    <div
                        style={{
                            position: 'absolute',
                            bottom: -28,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            backgroundColor: '#0066FF',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: 4,
                            fontSize: 12,
                            fontFamily: 'system-ui, -apple-system, sans-serif',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {Math.round(currentBounds.width)} × {Math.round(currentBounds.height)}
                    </div>
                </div>
            )}

            {/* Instructions */}
            <div
                style={{
                    position: 'fixed',
                    top: 20,
                    left: '50%',
                    transform: 'translateX(-50)',
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    color: 'white',
                    padding: '12px 20px',
                    borderRadius: 8,
                    fontSize: 14,
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
            >
                Drag to select area • Escape to cancel
            </div>
        </div>
    )
}
