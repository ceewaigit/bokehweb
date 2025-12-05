import { Command, CommandResult } from '../base/Command'
import { CommandContext } from '../base/CommandContext'
import { Effect } from '@/types/project'

export class UpdateEffectCommand extends Command {
    private originalData: Partial<Effect> | null = null

    constructor(
        private context: CommandContext,
        private effectId: string,
        private updates: Partial<Effect>
    ) {
        super({ name: 'UpdateEffect' })
    }

    canExecute(): boolean {
        return !!this.context.getProject()
    }

    async doExecute(): Promise<CommandResult> {
        const project = this.context.getProject()
        if (!project) return { success: false, error: 'No active project' }

        // Find the effect to store its original state
        let effect = project.timeline.effects?.find(e => e.id === this.effectId)

        if (!effect) {
            for (const recording of project.recordings) {
                const found = recording.effects?.find(e => e.id === this.effectId)
                if (found) {
                    effect = found
                    break
                }
            }
        }

        if (!effect) {
            return { success: false, error: 'Effect not found' }
        }

        // Capture only the properties that are being updated
        this.originalData = {}
        for (const key in this.updates) {
            if (Object.prototype.hasOwnProperty.call(this.updates, key)) {
                // @ts-ignore
                this.originalData[key] = effect[key]
            }
        }

        // Deep copy data object if it's being updated
        if (this.updates.data && effect.data) {
            this.originalData.data = JSON.parse(JSON.stringify(effect.data))
        }

        this.context.getStore().updateEffect(this.effectId, this.updates)
        return { success: true }
    }

    async doUndo(): Promise<CommandResult> {
        if (this.originalData) {
            this.context.getStore().updateEffect(this.effectId, this.originalData)
            return { success: true }
        }
        return { success: false, error: 'No original data to restore' }
    }
}
