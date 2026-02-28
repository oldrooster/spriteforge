import numpy as np
from PIL import Image
from scipy import ndimage


def apply_transparency(src_path, dst_path, target_color, tolerance, edges_only=True):
    img = Image.open(src_path).convert('RGBA')
    data = np.array(img, dtype=np.float32)

    rgb = data[:, :, :3]
    target = np.array(target_color, dtype=np.float32)
    distance = np.sqrt(np.sum((rgb - target) ** 2, axis=2))

    # Pixels within tolerance of target color
    color_match = distance <= tolerance

    if edges_only:
        # Only remove background pixels connected to the image edges.
        # This preserves interior pixels of the same color (e.g. white eyes).
        h, w = color_match.shape

        # Create a mask of edge-touching pixels
        edge_seed = np.zeros_like(color_match)
        edge_seed[0, :] = True
        edge_seed[-1, :] = True
        edge_seed[:, 0] = True
        edge_seed[:, -1] = True

        # Seeds are edge pixels that also match the target color
        seed = edge_seed & color_match

        # Flood fill: label connected regions in the color_match mask
        labeled, num_features = ndimage.label(color_match)

        # Find which labels touch the edge
        edge_labels = set(np.unique(labeled[seed]))
        edge_labels.discard(0)  # 0 = background (non-matching pixels)

        # Build mask of only edge-connected matching regions
        mask_full = np.isin(labeled, list(edge_labels))
    else:
        mask_full = color_match

    # Apply full transparency
    data[mask_full, 3] = 0

    # Anti-aliased edges: gradient alpha for pixels just outside tolerance
    edge_bound = tolerance * 1.5
    if edges_only:
        # Dilate the mask slightly to find bordering pixels
        dilated = ndimage.binary_dilation(mask_full, iterations=2)
        mask_edge = dilated & ~mask_full & (distance > tolerance) & (distance <= edge_bound)
    else:
        mask_edge = (distance > tolerance) & (distance <= edge_bound)

    if np.any(mask_edge):
        edge_alpha = ((distance[mask_edge] - tolerance) / (tolerance * 0.5) * 255)
        edge_alpha = np.clip(edge_alpha, 0, 255)
        data[mask_edge, 3] = np.minimum(edge_alpha, data[mask_edge, 3])

    Image.fromarray(data.astype(np.uint8)).save(dst_path, 'PNG')


def apply_rembg(src_path, dst_path):
    from rembg import remove
    img = Image.open(src_path)
    result = remove(img)
    result.save(dst_path, 'PNG')
