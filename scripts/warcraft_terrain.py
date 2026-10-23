"""Author: MiYu. Compile original map corners and source cliff templates into terrain surfaces.

Pinned terrain references and MIT notices: third_party/warcraft-map-format/README.md.
"""
import math


def terrain_layout(terrain, catalog, cliff_rows):
    width, height = terrain['vertexSize']
    columns, rows = width - 1, height - 1
    corners = terrain['corners']
    at = lambda x, y: corners[y * width + x]
    indices = lambda x, y: [y*width+x, (y+1)*width+x, (y+1)*width+x+1, y*width+x+1]
    layers = [corner[4] & 15 for corner in corners]
    ramps = [bool(corner[2] & 16) for corner in corners]
    ground_heights = [(corner[0] - 8192) / 512 for corner in corners]
    surface_heights = [ground + layer - 2 for ground, layer in zip(ground_heights, layers)]
    cliff_cells, entrances, placements, occupied = {}, set(), [], {}
    for y in range(rows):
        for x in range(columns):
            ids = indices(x, y)
            values = [layers[i] for i in ids]
            if len(set(values)) == 1:
                continue
            cliff_cells[x, y] = values
            if all(ramps[i] for i in ids) and not (values[0] == values[2] and values[1] == values[3]):
                entrances.add((x, y))
    # An all-ramp tile crosses the upper half of the slope; its lower corners
    # are shared with the lower approach tile and rise by half a source level.
    raised = set()
    for x, y in entrances:
        ids = indices(x, y)
        base = min(layers[i] for i in ids)
        raised.update(i for i in ids if layers[i] == base)
    for i in raised:
        surface_heights[i] += 0.5

    def skin(x, y):
        index = at(x, y)[4] >> 4
        if index == 15:
            index = 1
        if index >= len(cliff_rows):
            raise ValueError(f'Cliff texture {index} outside map tileset at {x},{y}')
        return index, cliff_rows[index]

    def place(x, y, base, model, texture, left, bottom, span):
        cells = [(left+dx, bottom+dy) for dy in range(span[1]) for dx in range(span[0])]
        if any(not (0 <= cx < columns and 0 <= cy < rows) for cx, cy in cells):
            raise ValueError(f'Cliff footprint leaves map at {x},{y}')
        if any(cell in occupied for cell in cells):
            raise ValueError(f'Overlapping cliff footprints at {x},{y}')
        entry = dict(cell=[x, y], model=model['id'], template=model['template'], texture=texture, baseLayer=base,
                     anchor=[left + span[0], bottom], cells=[list(cell) for cell in cells])
        placements.append(entry)
        for cell in cells:
            occupied[cell] = len(placements)-1

    # Transition templates have their measured two-cell footprint. The extra
    # cell is on the low side; remove both cells from the ordinary ground pass.
    for (x, y), values in cliff_cells.items():
        if (x, y) in entrances:
            continue
        ids, base = indices(x, y), min(values)
        marked = [ramps[i] for i in ids]
        if sum(marked) != 2 or max(values) - base != 1:
            continue
        if not ((marked[0] != marked[3] and marked[1] != marked[2]) or (marked[0] != marked[1] and marked[3] != marked[2])):
            continue
        texture, row = skin(x, y)
        pattern = ''.join(('LH'[value-base] if ramp else chr(65+value-base)) for value, ramp in zip(values, marked))
        family = row['rampModelDir']
        candidates = catalog['families'].get(family, {}).get(pattern)
        if not candidates:
            continue
        model = catalog['models'][candidates[0]]
        span = model['footprint']
        left, bottom = x, y
        if span[0] == 2:
            # SW/NW share the west edge, NE/SE the east edge.
            if values[0] + values[1] < values[2] + values[3]:
                left -= 1
        elif span[1] == 2:
            if values[0] + values[3] < values[1] + values[2]:
                bottom -= 1
        else:
            raise ValueError('Transition template must span two cells')
        extra = (left if left < x else x+1, y) if span[0] == 2 else (x, bottom if bottom < y else y+1)
        if extra in cliff_cells:
            continue
        place(x, y, base, model, texture, left, bottom, span)

    for (x, y), values in cliff_cells.items():
        if (x, y) in occupied or (x, y) in entrances:
            continue
        base = min(values)
        pattern = ''.join(chr(65+v-base) for v in values)
        texture, row = skin(x, y)
        candidates = catalog['families'].get(row['cliffModelDir'], {}).get(pattern)
        if not candidates:
            raise ValueError(f'Unsupported source cliff pattern {row["cliffModelDir"]}{pattern} at {x},{y}')
        model = catalog['models'][candidates[min(at(x, y)[3] >> 5, len(candidates)-1)]]
        place(x, y, base, model, texture, x, y, [1, 1])

    textures = []
    for y in range(height):
        for x in range(width):
            texture = None
            for cy in range(y-1, y+1):
                for cx in range(x-1, x+1):
                    if (cx, cy) in occupied:
                        row = cliff_rows[placements[occupied[cx, cy]]['texture']]
                        texture = terrain['groundTilesets'].index(row['groundTile']) if row['groundTile'] in terrain['groundTilesets'] else 0
                        break
                if texture is not None:
                    break
            if texture is None:
                texture = len(terrain['groundTilesets']) if at(x, y)[2] & 32 else at(x, y)[2] & 15
                if not at(x, y)[2] & 32 and texture >= len(terrain['groundTilesets']):
                    raise ValueError(f'Ground texture outside map tileset at {x},{y}')
            textures.append(texture)
    ground = []
    for y in range(rows):
        for x in range(columns):
            if (x, y) not in occupied:
                ground.append(dict(cell=[x, y], corners=indices(x, y), textures=[textures[i] for i in indices(x, y)], variation=at(x, y)[3] & 31))
    return dict(ground=ground, cliffs=placements, groundHeights=ground_heights, surfaceHeights=surface_heights,
                rampEntrances=[list(cell) for cell in sorted(entrances)], raisedCorners=sorted(raised))


def interpolate_height(terrain, heights, x, y):
    width, height = terrain['vertexSize']
    x, y = min(max(x, 0), width-1), min(max(y, 0), height-1)
    ix, iy = min(math.floor(x), width-2), min(math.floor(y), height-2)
    u, v = x-ix, y-iy
    a, b = heights[iy*width+ix:iy*width+ix+2]
    c, d = heights[(iy+1)*width+ix:(iy+1)*width+ix+2]
    return (a*(1-u)+b*u)*(1-v)+(c*(1-u)+d*u)*v


def placed_template(terrain, layout, placement, template):
    """Use existing source axes (X,Z,-Y), with one engine unit per 128 WC3 units."""
    anchor_x, anchor_y = placement['anchor']
    ox, oy = terrain['origin']
    points = []
    for x, height, z in template['positions']:
        grid_x, grid_y = anchor_x+x, anchor_y-z
        relief = interpolate_height(terrain, layout['groundHeights'], grid_x, grid_y)
        points.append([ox/128+grid_x, height+placement['baseLayer']-2+relief, -oy/128-grid_y])
    return points


def ground_layers(textures, variation, extended):
    """Source tile order is SW,NW,NE,SE; atlas masks use SE,SW,NE,NW bits."""
    result = []
    for index, texture in enumerate(sorted(set(textures))):
        if index == 0:
            tile = 16+variation if extended[texture] and variation < 16 else 15 if variation == 16 or not extended[texture] and variation else 0
        else:
            tile = sum(bit for value, bit in zip(textures, [2, 8, 4, 1]) if value == texture)
        result.append((texture, tile))
    return result
