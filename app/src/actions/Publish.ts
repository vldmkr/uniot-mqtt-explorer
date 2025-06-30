import { Action, ActionTypes } from '../reducers/Publish'
import { AppState } from '../reducers'
import { Base64Message } from '../../../backend/src/Model/Base64Message'
import { Dispatch } from 'redux'
import { MqttMessage, makePublishEvent, rendererEvents, rendererRpc, readFromFile } from '../../../events'
import { makeOpenDialogRpc } from '../../../events/OpenDialogRequest'
import { showError } from './Global'
import { Base64 } from 'js-base64'
import { encodeCbor, encodeCoseSign1 } from '../components/Sidebar/Publish/encoders/CborCoseEncoder'

export const setTopic = (topic?: string): Action => {
  return {
    topic,
    type: ActionTypes.PUBLISH_SET_TOPIC,
  }
}

export const openFile =
  (encoding: 'utf8' = 'utf8') =>
  async (dispatch: Dispatch<any>, getState: () => AppState) => {
    try {
      const file = await getFileContent(encoding)
      if (file) {
        dispatch(setPayload(file.data))
      }
    } catch (error) {
      dispatch(showError(error))
    }
  }

type FileParameters = {
  name: string
  data: string
}
async function getFileContent(encoding: string): Promise<FileParameters | undefined> {
  const rejectReasons = {
    noFileSelected: 'No file selected',
    errorReadingFile: 'Error reading file',
  }

  const { canceled, filePaths } = await rendererRpc.call(makeOpenDialogRpc(), {
    properties: ['openFile'],
    securityScopedBookmarks: true,
  })

  if (canceled) {
    return
  }

  const selectedFile = filePaths[0]
  if (!selectedFile) {
    throw rejectReasons.noFileSelected
  }
  try {
    const data = await rendererRpc.call(readFromFile, { filePath: selectedFile, encoding })
    return { name: selectedFile, data: data.toString(encoding) }
  } catch (error) {
    throw rejectReasons.errorReadingFile
  }
}

export const setPayload = (payload?: string): Action => {
  return {
    payload,
    type: ActionTypes.PUBLISH_SET_PAYLOAD,
  }
}

export const setQoS = (qos: 0 | 1 | 2): Action => {
  return {
    qos,
    type: ActionTypes.PUBLISH_SET_QOS,
  }
}

export const setEditorMode = (editorMode: string): Action => {
  return {
    editorMode,
    type: ActionTypes.PUBLISH_SET_EDITOR_MODE,
  }
}

export const publish = (connectionId: string) => (dispatch: Dispatch<any>, getState: () => AppState) => {
  const state = getState()
  const topic = state.publish.manualTopic ?? state.tree.get('selectedTopic')?.path()

  if (!topic) {
    return
  }

  let payload: Base64Message | null = null

  if (state.publish.payload) {
    // Handle different editor modes
    switch (state.publish.editorMode) {
      case 'cbor': {
        const result = encodeCbor(state.publish.payload)
        if (!result.success) {
          dispatch(showError(result.error || 'CBOR encoding failed'))
          return
        }
        payload = new Base64Message(result.data!)
        break
      }
      case 'cose': {
        const result = encodeCoseSign1(state.publish.payload)
        if (!result.success) {
          dispatch(showError(result.error || 'COSE Sign1 encoding failed'))
          return
        }
        payload = new Base64Message(result.data!)
        break
      }
      default: {
        // For 'text', 'json', 'xml' - treat as string
        payload = Base64Message.fromString(state.publish.payload)
        break
      }
    }
  }

  const publishEvent = makePublishEvent(connectionId)
  const mqttMessage: Partial<MqttMessage> = {
    topic,
    payload,
    retain: state.publish.retain,
    qos: state.publish.qos,
  }
  rendererEvents.emit(publishEvent, mqttMessage)
}

export const toggleRetain = (): Action => {
  return {
    type: ActionTypes.PUBLISH_TOGGLE_RETAIN,
  }
}
