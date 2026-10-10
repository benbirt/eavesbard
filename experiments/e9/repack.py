# Re-saves a single-file ONNX model with its weights in a separate file, which
# ONNX Runtime Web can load where a single file over about 1.4 GB fails
# (std::bad_alloc). Needs `pip install onnx`.
#   python repack.py model_q4f16.onnx out/
import sys
import onnx

src, out = sys.argv[1], sys.argv[2]
name = src.rsplit("/", 1)[-1]
model = onnx.load(src)
onnx.save_model(model, f"{out}/{name}", save_as_external_data=True, all_tensors_to_one_file=True,
                location=f"{name}_data", size_threshold=1024)
