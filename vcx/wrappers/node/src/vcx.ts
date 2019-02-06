import * as ffi from 'ffi'
import * as os from 'os'
import * as path from 'path'

import { FFIConfiguration, IFFIEntryPoint } from './rustlib'

export interface IVCXRuntimeConfig {
  basepath?: string
}

// VCXRuntime is the object that interfaces with the vcx sdk functions
// FFIConfiguration will contain all the sdk api functions
// VCXRuntimeConfg is a class that currently only contains a chosen basepath for the .so file
// I made it a class just in case we think of more needed configs

export class VCXRuntime {
  public readonly ffi: IFFIEntryPoint
  private _config: IVCXRuntimeConfig

  constructor (config: IVCXRuntimeConfig = {}) {
    this._config = config
    // initialize FFI
    const libraryPath = this._initializeBasepath()
    this.ffi = ffi.Library(libraryPath, FFIConfiguration)
  }

  private _initializeBasepath = (): string => {
    const platform = os.platform()
    const postfix = (platform === 'darwin') ? 'dylib' : (platform === 'win32') ? 'dll' : 'so'
    const library = `libvcx.${postfix}`
    const vcxPath = (platform === 'darwin')
        ? `/usr/local/lib/${library}`
        : (platform === 'win32')
            ? `c:\\windows\\system32\\${library}`
            : `/usr/lib/${library}`
    const customPath = process.env.LIBVCX_PATH ? process.env.LIBVCX_PATH + library : undefined
    return customPath || this._config.basepath || path.resolve(__dirname, vcxPath)
  }
}
