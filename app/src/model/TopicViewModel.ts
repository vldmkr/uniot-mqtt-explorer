import * as q from '../../../backend/src/Model'
import { Destroyable } from '../../../backend/src/Model/Destroyable'
import { MessageDecoder, decoders } from '../decoders'
import { EventDispatcher } from '../../../events'

function findDecoder<T extends Destroyable>(node: q.TreeNode<T>): TopicDecoder | undefined {
  const decoder = decoders.find(
    decoder =>
      decoder.canDecodeTopic?.(node.path()) || (node.message?.payload && decoder.canDecodeData?.(node.message?.payload))
  )

  return decoder
    ? {
        decoder,
        format: decoder.formats[0], // Use the first format from the decoder
      }
    : undefined
}

type TopicDecoder = { decoder: MessageDecoder; format: string | undefined }

export class TopicViewModel implements Destroyable {
  private selected: boolean
  private expanded: boolean
  private owner: q.TreeNode<TopicViewModel> | undefined
  private _decoder?: TopicDecoder
  /**
   * Reference counter for useViewModel hook
   */
  private referenceCounter = 0
  public selectionChange = new EventDispatcher<void>()
  public expandedChange = new EventDispatcher<void>()
  public onDecoderChange = new EventDispatcher<TopicDecoder | undefined>()

  get decoder(): TopicDecoder | undefined {
    if (!this._decoder) {
      const newDecoder = this.owner && findDecoder(this.owner)
      if (newDecoder) {
        this._decoder = newDecoder
        // Only dispatch if we found a decoder (async to avoid infinite loops)
        setTimeout(() => this.onDecoderChange.dispatch(newDecoder), 0)
      }
    }

    return this._decoder
  }

  set decoder(override: TopicDecoder | undefined) {
    this._decoder = override

    this.onDecoderChange.dispatch(override)
  }

  public constructor(treeNode: q.TreeNode<TopicViewModel>) {
    this.owner = treeNode
    this.selected = false
    this.expanded = false

    // // Clear cached decoder when a new message arrives so it gets re-determined
    // treeNode.onMessage.subscribe(() => {
    //   this._decoder = undefined
    // })
  }

  public retain() {
    this.referenceCounter += 1
  }

  public release() {
    this.referenceCounter -= 1
    if (this.referenceCounter <= 0) {
      this.destroy()
    }
  }

  public destroy() {
    console.log('destroy', this.referenceCounter)
    if (this.owner) {
      this.owner.viewModel = undefined
      this.owner = undefined
    }
    this.selectionChange.removeAllListeners()
    this.onDecoderChange.removeAllListeners()
    this.expandedChange.removeAllListeners()
  }

  public isSelected() {
    return this.selected
  }

  public isExpanded() {
    return this.expanded
  }

  public setSelected(selected: boolean) {
    this.selected = selected
    this.selectionChange.dispatch()
  }

  public setExpanded(expanded: boolean, fireEvent: boolean) {
    const didChange = this.expanded !== expanded
    this.expanded = expanded
    if (didChange && fireEvent) {
      this.expandedChange.dispatch()
    }
  }
}
