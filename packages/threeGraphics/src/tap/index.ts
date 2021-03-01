/**
 * @author       Yannick Deubel (https://github.com/yandeu)
 * @copyright    Copyright (c) 2021 Yannick Deubel; Project Url: https://github.com/yandeu/tap
 * @license      {@link https://github.com/yandeu/tap/blob/master/LICENSE|MIT}
 * @description  Inspired by tapjs (https://www.npmjs.com/package/tapjs)
 */

import { eventMatrix } from './eventMatrix'
import { EventTypes } from './types'
import { Events } from '@yandeu/events'

interface TapEvent {
  position: { x: number; y: number }
  event: Event
  dragging?: boolean
}

type TapCallback = (data?: TapEvent) => void

interface EventMap {
  down: (event: TapEvent) => void
  move: (event: TapEvent) => void
  up: (event: TapEvent) => void
}

export class Tap {
  private _events = new Events<EventMap>()

  private domElement: null | HTMLElement = null

  _isDown = false
  _isPaused = false

  private active: { [key in EventTypes]: boolean } = {
    touch: false,
    mouse: false,
    pointer: false
  }

  private registered: { [key in EventTypes]: boolean } = {
    touch: false,
    mouse: false,
    pointer: false
  }

  private _currentPosition: { x: number; y: number } = { x: -1, y: -1 }
  private _lastPosition: { x: number; y: number } = { x: -1, y: -1 }

  constructor(domElement: HTMLElement) {
    this._add(domElement)
  }

  public get isDown() {
    return this._isDown
  }

  private set _position(position: { x: number; y: number }) {
    if (position.x === this._currentPosition.x && position.y == this._currentPosition.y) return

    this._lastPosition = this._currentPosition
    this._currentPosition = position
  }

  public get currentPosition() {
    return this._currentPosition
  }

  public get lastPosition() {
    return this._lastPosition
  }

  public get isPaused() {
    return this._isPaused
  }

  public pause() {
    this._isPaused = true
  }

  public resume() {
    this._isPaused = false
  }

  public get pointerLock() {
    return {
      request: () => {
        return new Promise(resolve => {
          if (this.pointerLock.isLocked) return

          // listen to pointer lock change events
          document.addEventListener(
            'pointerlockchange',
            e => {
              resolve(e)
            },
            { once: true }
          )

          this.once.down(() => {
            this.domElement?.requestPointerLock()
          })
        })
      },
      exit: () => {
        return new Promise(resolve => {
          if (!this.pointerLock.isLocked) return

          // listen to pointer lock change events
          document.addEventListener(
            'pointerlockchange',
            e => {
              resolve(e)
            },
            { once: true }
          )

          document.exitPointerLock()
        })
      },
      isLocked: !!document.pointerLockElement
    }
  }

  /** (once ignores paused) */
  public get once() {
    return {
      down: (callback: TapCallback) => {
        this._events.once('down', data => {
          callback(data)
        })
      },
      move: (callback: TapCallback) => {
        this._events.once('move', data => {
          callback(data)
        })
      },
      up: (callback: TapCallback) => {
        this._events.once('up', data => {
          callback(data)
        })
      }
    }
  }

  public get on() {
    return {
      down: (callback: TapCallback) => {
        this._events.on('down', data => {
          if (!this._isPaused) callback(data)
        })
      },
      move: (callback: TapCallback) => {
        this._events.on('move', data => {
          if (!this._isPaused) callback(data)
        })
      },
      up: (callback: TapCallback) => {
        this._events.on('up', data => {
          if (!this._isPaused) callback(data)
        })
      }
    }
  }

  private _add(element?: any) {
    const el = (this.domElement = element ?? window)
    if (!el) console.warn('[tap] No domElement found!')

    this._onDown = this._onDown.bind(this)
    this._onMove = this._onMove.bind(this)
    this._onUp = this._onUp.bind(this)

    eventMatrix.forEach(input => {
      if (input.test && input.enabled) {
        this.active[input.name] = true

        el.addEventListener(input.events.down, this._onDown, false)
        el.addEventListener(input.events.move, this._onMove, false)
        el.addEventListener(input.events.up, this._onUp, false)
      }
    })
  }

  private _remove(type: keyof typeof EventTypes) {
    if (!this.active[type]) return

    const el = this.domElement as HTMLElement
    if (!el) console.warn('[tap] No domElement found!')

    eventMatrix.forEach(input => {
      if (input.name === type) {
        el.removeEventListener(input.events.down, this._onDown, false)
        el.removeEventListener(input.events.move, this._onMove, false)
        el.removeEventListener(input.events.up, this._onUp, false)
      }
    })

    this.active[type] = false
  }

  public destroy() {
    this.pause()

    Object.keys(this.active).forEach(key => {
      this._remove(key as keyof typeof EventTypes)
    })

    this._events.removeAllListeners()

    // @ts-ignore
    this._events = null
    // @ts-ignore
    this.domElement = null
    // @ts-ignore
    this._isDown = null
    // @ts-ignore
    this._isPaused = null
    // @ts-ignore
    this.active = null
    // @ts-ignore
    this.registered = null
    // @ts-ignore
    this._currentPosition = null
    // @ts-ignore
    this._lastPosition = null
  }

  private _calcPosition(e: any) {
    let x: number
    let y: number

    if (e.touches && e.touches[0]) {
      x = e.touches[0].pageX
      y = e.touches[0].pageY
    } else if (e.clientX) {
      x = e.clientX
      y = e.clientY
    } else {
      x = this._currentPosition.x
      y = this._currentPosition.y
    }

    if (this.pointerLock.isLocked) {
      x = e.movementX
      y = e.movementY
    }

    this._position = { x, y }

    return { x, y }
  }

  private _removeDuplicates(e: Event) {
    if (e.type === 'pointerdown') this.registered.pointer = true
    if (e.type === 'touchstart') this.registered.touch = true
    if (e.type === 'mousedown') this.registered.mouse = true

    if (e.type === 'touchstart' && this.active.touch && this.registered.pointer) {
      this._remove('touch')
      return false
    }

    if (e.type === 'mousedown' && this.active.mouse && (this.registered.pointer || this.registered.touch)) {
      this._remove('mouse')
      return false
    }

    return true
  }

  private _onDown(e: any) {
    const proceed = this._removeDuplicates(e)
    if (!proceed) return

    this._isDown = true

    this._events.emit('down', { position: this._calcPosition(e), event: e })
  }

  private _onMove(e: Event) {
    this._events.emit('move', { position: this._calcPosition(e), event: e, dragging: this._isDown })
  }

  private _onUp(e: Event) {
    this._isDown = false

    this._events.emit('up', { position: this._calcPosition(e), event: e })
  }
}
