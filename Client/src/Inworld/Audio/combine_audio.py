import sys
import base64
import wave
import struct
from pydub import AudioSegment
import numpy as np
import scipy.io.wavfile as wavfile
import io

new_sample_rate = 44100  # 44.1 kHz
new_bit_depth = 16  # 16-bit

def get_base64_audios(base64_audio_files):
    base64_audios = []
    for file in base64_audio_files:
        with open(file, 'r') as file:
            base64_audio_string = file.read()
            base64_audios.append(base64_audio_string)

    return base64_audios

def decode_base64_to_bytes(base64_string):
    return base64.b64decode(base64_string)

def extract_wav_data(wav_data):
    return wav_data[44:]

def combine_wav_files(base64_audio_files):
    audio_data_chunks = []
    base64_audios = get_base64_audios(base64_audio_files)
    for base64_audio in base64_audios:
        binary_audio = decode_base64_to_bytes(base64_audio)
        audio_data = extract_wav_data(binary_audio)
        audio_data_chunks.append(audio_data)

    concatenated_audio_data = b''.join(audio_data_chunks)

    first_audio = decode_base64_to_bytes(base64_audios[0])
    header = first_audio[:44]

    chunk_size = len(concatenated_audio_data) + 36
    subchunk2_size = len(concatenated_audio_data)
    header = bytearray(header)
    struct.pack_into('<I', header, 4, chunk_size)
    struct.pack_into('<I', header, 40, subchunk2_size)

    final_wav_data = bytes(header) + concatenated_audio_data
    return final_wav_data

def change_wav_properties(input_bytes, output_file, new_sample_rate, new_bit_depth):
    # Load the original WAV file
    audio = AudioSegment.from_file(io.BytesIO(input_bytes), format="wav")

    # Change the sample rate
    audio = audio.set_frame_rate(new_sample_rate)

    # Change the bit depth
    if new_bit_depth == 8:
        audio = audio.set_sample_width(1)
    elif new_bit_depth == 16:
        audio = audio.set_sample_width(2)
    elif new_bit_depth == 24:
        audio = audio.set_sample_width(3)
    elif new_bit_depth == 32:
        audio = audio.set_sample_width(4)
    else:
        raise ValueError("Unsupported bit depth. Use 8, 16, 24, or 32.")

    # Export the modified audio to a new file
    audio.export(output_file, format="wav")

    print(f'Combined WAV file has been written to {output_file}')

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print('Usage: python combine_audio.py <output_filename> <base64_audio_1> [<base64_audio_2> ...]')
        sys.exit(1)
    
    output_filename = sys.argv[1]
    base64_audio_files = sys.argv[2:]
    
    final_wav_data = combine_wav_files(base64_audio_files)
    change_wav_properties(final_wav_data, output_filename, new_sample_rate, new_bit_depth)