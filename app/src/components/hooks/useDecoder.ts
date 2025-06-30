import * as q from '../../../../backend/src/Model'
import { useCallback, useState, useEffect } from 'react'
import { TopicViewModel } from '../../model/TopicViewModel'
import { useSubscription } from './useSubscription'
import { useViewModel } from '../Tree/TreeNode/effects/useViewModel'
import { DecoderEnvelope } from '../../decoders/DecoderEnvelope'
import { Decoder } from '../../../../backend/src/Model/Decoder'

export type DecoderFunction = (message: q.Message) => DecoderEnvelope | undefined

/**
 * Provides the latest decoder for a topic
 *
 * @param treeNode
 * @returns
 */
export function useDecoder(treeNode: q.TreeNode<TopicViewModel> | undefined): DecoderFunction {
  const viewModel = useViewModel(treeNode)
  const [decoder, setDecoder] = useState(viewModel?.decoder)
  const [lastMessageTime, setLastMessageTime] = useState(0)

  useSubscription(viewModel?.onDecoderChange, setDecoder)

  // Subscribe to message changes to refresh decoder
  useEffect(() => {
    if (!treeNode) return

    const handleMessage = () => {
      setLastMessageTime(Date.now())
      // Force decoder refresh by accessing the getter
      const currentDecoder = viewModel?.decoder
      setDecoder(currentDecoder)
    }

    treeNode.onMessage.subscribe(handleMessage)
    return () => treeNode.onMessage.unsubscribe(handleMessage)
  }, [treeNode, viewModel])

  return useCallback(
    message => {
      return decoder && message.payload
        ? decoder.decoder.decode(message.payload, decoder.format)
        : { message: message.payload ?? undefined, decoder: Decoder.NONE }
    },
    [decoder, lastMessageTime] // Add lastMessageTime as dependency
  )
}
