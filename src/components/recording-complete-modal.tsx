"use client"

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from './ui/button'
import { CheckCircle, Download, Edit, Share, X } from 'lucide-react'

interface RecordingCompleteModalProps {
  isOpen: boolean
  onClose: () => void
  recordingBlob: Blob | null
  duration: number
  onDownload: () => void
  onEdit: () => void
}

export function RecordingCompleteModal({
  isOpen,
  onClose,
  recordingBlob,
  duration,
  onDownload,
  onEdit
}: RecordingCompleteModalProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getFileSize = () => {
    if (!recordingBlob) return '0 MB'
    const mb = recordingBlob.size / (1024 * 1024)
    return `${mb.toFixed(1)} MB`
  }

  const handlePreview = () => {
    if (recordingBlob && !previewUrl) {
      const url = URL.createObjectURL(recordingBlob)
      setPreviewUrl(url)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-border bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Recording Complete!</h3>
                    <p className="text-sm text-muted-foreground">Your screen recording is ready</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="h-8 w-8 p-0 hover:bg-muted"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Preview */}
              <div className="space-y-3">
                <h4 className="font-medium">Preview</h4>
                <div className="aspect-video bg-muted rounded-lg overflow-hidden relative group">
                  {previewUrl ? (
                    <video
                      src={previewUrl}
                      className="w-full h-full object-cover"
                      controls
                      preload="metadata"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Button
                        variant="secondary"
                        onClick={handlePreview}
                        className="opacity-80 group-hover:opacity-100 transition-opacity"
                      >
                        Load Preview
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="text-sm text-muted-foreground">Duration</div>
                  <div className="font-medium">{formatDuration(duration)}</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="text-sm text-muted-foreground">File Size</div>
                  <div className="font-medium">{getFileSize()}</div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex space-x-3">
                <Button
                  onClick={onDownload}
                  className="flex-1"
                  size="lg"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
                <Button
                  onClick={onEdit}
                  variant="secondary"
                  className="flex-1"
                  size="lg"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="px-4"
                >
                  <Share className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}