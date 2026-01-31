#!/usr/bin/env lua
-- Align grammars.json repo/rev (and optional branch/path) with nvim-treesitter.
--
-- Requires dkjson (you said you installed lua-dkjson).
--
-- Default behavior is DRY-RUN (prints what would change, writes nothing).
-- Use `--write` to overwrite `grammars.json` in-place.
--
-- Usage:
--   lua scripts/grammars-align-nvim-treesitter.lua
--   lua scripts/grammars-align-nvim-treesitter.lua --write
--   lua scripts/grammars-align-nvim-treesitter.lua --parsers /path/to/parsers.lua --grammars /path/to/grammars.json

local json = require("dkjson")

local DEFAULT_PARSERS =
  "/home/ivan/github/nvim-treesitter/nvim-treesitter/lua/nvim-treesitter/parsers.lua"
local DEFAULT_GRAMMARS = "grammars.json"

-- Grammars we intentionally do NOT align to nvim-treesitter repos/revs.
-- Keep this list minimal and explicit.
local NVIM_ALIGN_EXCLUDE = {
  julia = true,
}

local function read_file(pathname)
  local f, err = io.open(pathname, "rb")
  if not f then return nil, err end
  local data = f:read("*a")
  f:close()
  return data
end

local function write_file(pathname, data)
  local f, err = io.open(pathname, "wb")
  if not f then return nil, err end
  f:write(data)
  f:close()
  return true
end

local function parse_args(argv)
  local opts = {
    parsers = DEFAULT_PARSERS,
    grammars = DEFAULT_GRAMMARS,
    write = false,
  }

  local i = 1
  while i <= #argv do
    local a = argv[i]
    if a == "--parsers" then
      i = i + 1
      opts.parsers = argv[i]
    elseif a == "--grammars" then
      i = i + 1
      opts.grammars = argv[i]
    elseif a == "--write" then
      opts.write = true
    elseif a == "-h" or a == "--help" then
      io.write([[
Usage:
  lua scripts/grammars-align-nvim-treesitter.lua [options]

Options:
  --parsers PATH     Path to nvim-treesitter parsers.lua
  --grammars PATH    Path to our grammars.json
  --write            Overwrite grammars.json in-place
  -h, --help         Show help
]])
      os.exit(0)
    end
    i = i + 1
  end

  return opts
end

local function load_parsers(pathname)
  local ok, res = pcall(dofile, pathname)
  if not ok then
    return nil, ("Failed to load parsers.lua: " .. tostring(res))
  end
  if type(res) ~= "table" then
    return nil, ("Expected parsers.lua to return a table, got: " .. type(res))
  end
  return res
end

local function build_nvim_index(parsers)
  local index = {}
  local total = 0

  for name, cfg in pairs(parsers) do
    if type(name) == "string" and type(cfg) == "table" then
      local info = cfg.install_info
      if type(info) == "table" and type(info.url) == "string" then
        total = total + 1
        index[name] = {
          url = info.url,
          rev = info.revision,
          branch = info.branch,
          location = info.location,
        }
      end
    end
  end

  return index, total
end

local function main()
  local opts = parse_args(arg or {})

  local parsers, perr = load_parsers(opts.parsers)
  if not parsers then
    io.stderr:write(perr .. "\n")
    os.exit(1)
  end

  local nvim, nvim_total = build_nvim_index(parsers)
  for name, _ in pairs(NVIM_ALIGN_EXCLUDE) do
    if nvim[name] ~= nil then
      nvim[name] = nil
      nvim_total = nvim_total - 1
    end
  end

  local grammars_text, gerr = read_file(opts.grammars)
  if not grammars_text then
    io.stderr:write("Failed to read " .. opts.grammars .. ": " .. tostring(gerr) .. "\n")
    os.exit(1)
  end

  local doc, pos, derr = json.decode(grammars_text, 1, nil)
  if derr then
    io.stderr:write("Failed to parse " .. opts.grammars .. ": " .. tostring(derr) .. "\n")
    os.exit(1)
  end
  if type(doc) ~= "table" or type(doc.grammars) ~= "table" then
    io.stderr:write("Expected grammars.json to contain { grammars: [...] }\n")
    os.exit(1)
  end

  local matched = 0
  local updated = 0
  local missing_in_ours = {}
  local seen = {}
  local changes = {}

  for _, g in ipairs(doc.grammars) do
    if type(g) == "table" and type(g.name) == "string" then
      if NVIM_ALIGN_EXCLUDE[g.name] then
        seen[g.name] = true
      else
      local info = nvim[g.name]
      if info then
        matched = matched + 1
        seen[g.name] = true

        local changed = false
        local ch = nil

        if type(info.url) == "string" and info.url ~= "" and g.repo ~= info.url then
          ch = ch or {}
          ch.repo = { from = g.repo, to = info.url }
          g.repo = info.url
          changed = true
        end
        if type(info.rev) == "string" and info.rev ~= "" and g.rev ~= info.rev then
          ch = ch or {}
          ch.rev = { from = g.rev, to = info.rev }
          g.rev = info.rev
          changed = true
        end
        if type(info.branch) == "string" and info.branch ~= "" then
          if g.branch ~= info.branch then
            ch = ch or {}
            ch.branch = { from = g.branch, to = info.branch }
            g.branch = info.branch
            changed = true
          end
        end
        if type(info.location) == "string" and info.location ~= "" then
          if g.path ~= info.location then
            ch = ch or {}
            ch.path = { from = g.path, to = info.location }
            g.path = info.location
            changed = true
          end
        end

        if changed then
          updated = updated + 1
          changes[g.name] = ch or true
        end
      end
      end
    end
  end

  for name, _ in pairs(nvim) do
    if not seen[name] and not NVIM_ALIGN_EXCLUDE[name] then
      table.insert(missing_in_ours, name)
    end
  end
  table.sort(missing_in_ours)

  io.write(string.format("nvim-treesitter parsers: %d\n", nvim_total))
  io.write(string.format("matched grammars: %d\n", matched))
  io.write(string.format("updated grammars: %d\n", updated))
  io.write(string.format("missing in our grammars.json: %d\n", #missing_in_ours))
  if #missing_in_ours > 0 then
    local sample = {}
    for i = 1, math.min(10, #missing_in_ours) do
      table.insert(sample, missing_in_ours[i])
    end
    io.write("  sample: " .. table.concat(sample, ", ") .. "\n")
  end

  if not opts.write then
    io.write("dry-run: not writing\n")
    if updated > 0 then
      local names = {}
      for name, _ in pairs(changes) do table.insert(names, name) end
      table.sort(names)
      io.write("changed grammars:\n")
      for _, name in ipairs(names) do
        io.write("  - " .. name .. "\n")
      end
    end
    return
  end

  local keyorder = {
    "name",
    "repo",
    "rev",
    "branch",
    "path",
    "has_rust_bindings",
    "cargo_toml_path",
    "highlights_scm_path",
    "highlights_scm_repo",
    "highlights_scm_ref",
  }

  local encoded = json.encode(doc, { indent = true, keyorder = keyorder })
  local ok, werr = write_file(opts.grammars, encoded .. "\n")
  if not ok then
    io.stderr:write("Failed to write " .. opts.grammars .. ": " .. tostring(werr) .. "\n")
    os.exit(1)
  end
  io.write("wrote " .. opts.grammars .. "\n")
end

main()
